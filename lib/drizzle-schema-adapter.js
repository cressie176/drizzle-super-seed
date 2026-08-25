const { getTableColumns } = require('drizzle-orm');
const { toCamelCase, toSnakeCase } = require('drizzle-orm/casing');
const {
  IncompleteSchemaError,
  MixedDialectError,
  UnsupportedColumnTypeError,
  UnsupportedRelationshipError,
} = require('./generation-errors');
const mariaDbDialect = require('./mariadb/mariadb-dialect');
const postgresDialect = require('./postgres/postgres-dialect');
const sqliteDialect = require('./sqlite/sqlite-dialect');

const IdentifierCasing = Object.freeze({
  SnakeCase: 'snake_case',
  CamelCase: 'camelCase',
});

const dialects = [postgresDialect, mariaDbDialect, sqliteDialect];

const casingConversions = {
  [IdentifierCasing.SnakeCase]: toSnakeCase,
  [IdentifierCasing.CamelCase]: toCamelCase,
};

const verbatim = (name) => name;

const databaseName = (column, casing) => {
  if (!column.keyAsName) return column.name;
  return (casingConversions[casing] ?? verbatim)(column.name);
};

const kindOf = (dialect, tableKey, propertyName, column) => {
  const kind = dialect.columnKind(column);
  if (kind) return kind;
  throw new UnsupportedColumnTypeError({ table: tableKey, column: propertyName, columnType: column.columnType });
};

const canonicalColumn = (dialect, tableKey, propertyName, column, casing) => {
  const kind = kindOf(dialect, tableKey, propertyName, column);
  return {
    name: databaseName(column, casing),
    propertyName,
    kind,
    jsType: column.dataType,
    notNull: column.notNull,
    hasDatabaseDefault: column.hasDefault,
    isPrimaryKey: column.primary,
    sequenceOwned: dialect.sequenceOwned(column),
    identityAlways: dialect.identityAlways(column),
    ...dialect.valueRange(column),
    ...dialect.detail(kind, column),
  };
};

const canonicalColumns = (dialect, key, table, casing) =>
  Object.entries(getTableColumns(table)).map(([propertyName, column]) =>
    canonicalColumn(dialect, key, propertyName, column, casing),
  );

const databaseNames = (columns, casing) => columns.map((column) => databaseName(column, casing));

const columnsOf = (table) => Object.values(getTableColumns(table));

const declaredPrimaryKey = (config, casing) =>
  config.primaryKeys.flatMap((primaryKey) => databaseNames(primaryKey.columns, casing));

const columnPrimaryKey = (table, casing) =>
  databaseNames(
    columnsOf(table).filter((column) => column.primary),
    casing,
  );

// A primary key is needed by two features, not by the schema: a per-parent count iterates one,
// and the deferred pass patches rows by one. Both are knowable only from a generate() call, so
// the engine refuses them there and every other table generates without a key.
const primaryKeyOf = (config, table, casing) => [
  ...columnPrimaryKey(table, casing),
  ...declaredPrimaryKey(config, casing),
];

// PostgreSQL 15+ can declare UNIQUE NULLS NOT DISTINCT, and drizzle exposes it on both the
// table-level constraint and the column-level shorthand. Every other dialect treats NULLs as
// distinct with no opt-out, so their adapters report false.
const uniqueConstraint = (columns, nullsNotDistinct) => ({ columns, nullsNotDistinct: Boolean(nullsNotDistinct) });

const declaredUniqueConstraints = (config, casing) =>
  config.uniqueConstraints.map((constraint) =>
    uniqueConstraint(databaseNames(constraint.columns, casing), constraint.nullsNotDistinct),
  );

const columnUniqueConstraints = (table, casing) =>
  columnsOf(table)
    .filter((column) => column.isUnique)
    .map((column) => uniqueConstraint([databaseName(column, casing)], column.uniqueType === 'not distinct'));

const uniqueConstraintsOf = (config, table, casing) => [
  ...columnUniqueConstraints(table, casing),
  ...declaredUniqueConstraints(config, casing),
];

const propertyNameOf = (columns, name) => columns.find((column) => column.name === name).propertyName;

const propertyNames = (columns, referenceColumns, casing) =>
  referenceColumns.map((column) => propertyNameOf(columns, databaseName(column, casing)));

const rejectCompositeReference = (key, columns, reference, casing) => {
  if (reference.columns.length === 1) return;
  throw new UnsupportedRelationshipError({
    table: key,
    columns: propertyNames(columns, reference.columns, casing),
  });
};

const referencedTableKey = (dialect, key, propertyName, foreignTable, tableKeys) => {
  const referencedKey = tableKeys.get(foreignTable);
  if (referencedKey !== undefined) return referencedKey;
  throw new IncompleteSchemaError({
    table: key,
    column: propertyName,
    referencedTable: dialect.tableConfig(foreignTable).name,
  });
};

const canonicalForeignKey = (dialect, key, columns, foreignKey, tableKeys, casing) => {
  const reference = foreignKey.reference();
  rejectCompositeReference(key, columns, reference, casing);
  const [column] = reference.columns;
  const [foreignColumn] = reference.foreignColumns;
  const columnName = databaseName(column, casing);
  const propertyName = propertyNameOf(columns, columnName);
  return {
    columnName,
    referencedTableKey: referencedTableKey(dialect, key, propertyName, reference.foreignTable, tableKeys),
    referencedColumnName: databaseName(foreignColumn, casing),
  };
};

const canonicalForeignKeys = (dialect, key, columns, config, tableKeys, casing) =>
  config.foreignKeys.map((foreignKey) => canonicalForeignKey(dialect, key, columns, foreignKey, tableKeys, casing));

const schemaName = (config) => (config.schema === undefined ? {} : { schemaName: config.schema });

const canonicalTable = (dialect, key, table, tableKeys, casing) => {
  const config = dialect.tableConfig(table);
  const columns = canonicalColumns(dialect, key, table, casing);
  return {
    key,
    name: config.name,
    ...schemaName(config),
    columns,
    primaryKey: primaryKeyOf(config, table, casing),
    foreignKeys: canonicalForeignKeys(dialect, key, columns, config, tableKeys, casing),
    uniqueConstraints: uniqueConstraintsOf(config, table, casing),
    drizzleTable: table,
  };
};

const declaredTables = (schema, dialect) => Object.entries(schema).filter(([, value]) => dialect.isTable(value));

const dialectsPresent = (schema) =>
  dialects
    .map((dialect) => ({ dialect, entries: declaredTables(schema, dialect) }))
    .filter(({ entries }) => entries.length > 0);

const tablesByDialect = (present) =>
  Object.fromEntries(present.map(({ dialect, entries }) => [dialect.dialect, entries.map(([key]) => key)]));

// An empty schema module has no dialect to detect; Postgres is the default so that the error a
// caller sees is about the missing tables rather than about the dialect.
const soleDialect = (schema) => {
  const present = dialectsPresent(schema);
  if (present.length <= 1) return present[0] ?? { dialect: postgresDialect, entries: [] };
  throw new MixedDialectError({
    dialects: present.map(({ dialect }) => dialect.dialect),
    tables: tablesByDialect(present),
  });
};

const keysByTableIdentity = (entries) => new Map(entries.map(([key, table]) => [table, key]));

const extractCanonicalSchema = (schema, options = {}) => {
  const { dialect, entries } = soleDialect(schema);
  const tableKeys = keysByTableIdentity(entries);
  return {
    dialect: dialect.dialect,
    tables: new Map(
      entries.map(([key, table]) => [key, canonicalTable(dialect, key, table, tableKeys, options.casing)]),
    ),
  };
};

module.exports = { IdentifierCasing, extractCanonicalSchema };
