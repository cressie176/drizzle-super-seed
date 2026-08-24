const { getTableColumns, is } = require('drizzle-orm');
const { toCamelCase, toSnakeCase } = require('drizzle-orm/casing');
const { PgTable, getTableConfig } = require('drizzle-orm/pg-core');
const { ColumnKind } = require('./column-kind');
const {
  IncompleteSchemaError,
  MissingPrimaryKeyError,
  UnsupportedColumnTypeError,
  UnsupportedRelationshipError,
} = require('./generation-errors');

const IdentifierCasing = Object.freeze({
  SnakeCase: 'snake_case',
  CamelCase: 'camelCase',
});

const columnKinds = {
  PgInteger: ColumnKind.Integer,
  PgSmallInt: ColumnKind.Integer,
  PgSerial: ColumnKind.Integer,
  PgSmallSerial: ColumnKind.Integer,
  PgBigInt53: ColumnKind.BigInt,
  PgBigInt64: ColumnKind.BigInt,
  PgBigSerial53: ColumnKind.BigInt,
  PgBigSerial64: ColumnKind.BigInt,
  PgNumeric: ColumnKind.Decimal,
  PgNumericNumber: ColumnKind.Decimal,
  PgNumericBigInt: ColumnKind.Decimal,
  PgReal: ColumnKind.Real,
  PgDoublePrecision: ColumnKind.Real,
  PgVarchar: ColumnKind.Text,
  PgChar: ColumnKind.Text,
  PgText: ColumnKind.Text,
  PgBoolean: ColumnKind.Boolean,
  PgUUID: ColumnKind.Uuid,
  PgDate: ColumnKind.Date,
  PgDateString: ColumnKind.Date,
  PgTimestamp: ColumnKind.Timestamp,
  PgTimestampString: ColumnKind.Timestamp,
  PgTime: ColumnKind.Time,
  PgJson: ColumnKind.Json,
  PgJsonb: ColumnKind.Json,
  PgEnumColumn: ColumnKind.Enum,
};

const sequenceColumnTypes = new Set(['PgSerial', 'PgSmallSerial', 'PgBigSerial53', 'PgBigSerial64']);

const casingConversions = {
  [IdentifierCasing.SnakeCase]: toSnakeCase,
  [IdentifierCasing.CamelCase]: toCamelCase,
};

const verbatim = (name) => name;

const databaseName = (column, casing) => {
  if (!column.keyAsName) return column.name;
  return (casingConversions[casing] ?? verbatim)(column.name);
};

const boundedLength = (column) => (column.length === undefined ? {} : { maxLength: column.length });

const precisionAndScale = (column) =>
  column.precision === undefined ? {} : { precision: column.precision, scale: column.scale };

const declaredValues = (column) => ({ enumValues: [...column.enumValues] });

const timezoneAwareness = (column) => ({ withTimezone: column.withTimezone });

const noDetail = () => ({});

const columnDetails = {
  [ColumnKind.Text]: boundedLength,
  [ColumnKind.Decimal]: precisionAndScale,
  [ColumnKind.Enum]: declaredValues,
  [ColumnKind.Timestamp]: timezoneAwareness,
};

const detailOf = (kind, column) => (columnDetails[kind] ?? noDetail)(column);

const kindOf = (table, name, column) => {
  const kind = columnKinds[column.columnType];
  if (kind) return kind;
  throw new UnsupportedColumnTypeError({ table, column: name, columnType: column.columnType });
};

const ownsSequence = (column) => sequenceColumnTypes.has(column.columnType) || Boolean(column.generatedIdentity);

const canonicalColumn = (table, propertyName, column, casing) => {
  const name = databaseName(column, casing);
  const kind = kindOf(table, name, column);
  return {
    name,
    propertyName,
    kind,
    notNull: column.notNull,
    hasDatabaseDefault: column.hasDefault,
    isPrimaryKey: column.primary,
    sequenceOwned: ownsSequence(column),
    identityAlways: column.generatedIdentity?.type === 'always',
    ...detailOf(kind, column),
  };
};

const canonicalColumns = (config, table, casing) =>
  Object.entries(getTableColumns(table)).map(([propertyName, column]) =>
    canonicalColumn(config.name, propertyName, column, casing),
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

const primaryKeyOf = (config, table, casing) => {
  const primaryKey = [...columnPrimaryKey(table, casing), ...declaredPrimaryKey(config, casing)];
  if (primaryKey.length > 0) return primaryKey;
  throw new MissingPrimaryKeyError({ table: config.name });
};

const declaredUniqueConstraints = (config, casing) =>
  config.uniqueConstraints.map((constraint) => databaseNames(constraint.columns, casing));

const columnUniqueConstraints = (table, casing) =>
  columnsOf(table)
    .filter((column) => column.isUnique)
    .map((column) => [databaseName(column, casing)]);

const uniqueConstraintsOf = (config, table, casing) => [
  ...columnUniqueConstraints(table, casing),
  ...declaredUniqueConstraints(config, casing),
];

const rejectCompositeReference = (config, reference, casing) => {
  if (reference.columns.length === 1) return;
  throw new UnsupportedRelationshipError({
    table: config.name,
    columns: databaseNames(reference.columns, casing),
  });
};

const referencedTableKey = (config, columnName, foreignTable, tableKeys) => {
  const key = tableKeys.get(foreignTable);
  if (key !== undefined) return key;
  throw new IncompleteSchemaError({
    table: config.name,
    column: columnName,
    referencedTable: getTableConfig(foreignTable).name,
  });
};

const canonicalForeignKey = (config, foreignKey, tableKeys, casing) => {
  const reference = foreignKey.reference();
  rejectCompositeReference(config, reference, casing);
  const [column] = reference.columns;
  const [foreignColumn] = reference.foreignColumns;
  const columnName = databaseName(column, casing);
  return {
    columnName,
    referencedTableKey: referencedTableKey(config, columnName, reference.foreignTable, tableKeys),
    referencedColumnName: databaseName(foreignColumn, casing),
  };
};

const canonicalForeignKeys = (config, tableKeys, casing) =>
  config.foreignKeys.map((foreignKey) => canonicalForeignKey(config, foreignKey, tableKeys, casing));

const schemaName = (config) => (config.schema === undefined ? {} : { schemaName: config.schema });

const canonicalTable = (key, table, tableKeys, casing) => {
  const config = getTableConfig(table);
  return {
    key,
    name: config.name,
    ...schemaName(config),
    columns: canonicalColumns(config, table, casing),
    primaryKey: primaryKeyOf(config, table, casing),
    foreignKeys: canonicalForeignKeys(config, tableKeys, casing),
    uniqueConstraints: uniqueConstraintsOf(config, table, casing),
    drizzleTable: table,
  };
};

const declaredTables = (schema) => Object.entries(schema).filter(([, value]) => is(value, PgTable));

const keysByTableIdentity = (entries) => new Map(entries.map(([key, table]) => [table, key]));

const extractCanonicalSchema = (schema, options = {}) => {
  const entries = declaredTables(schema);
  const tableKeys = keysByTableIdentity(entries);
  return {
    tables: new Map(entries.map(([key, table]) => [key, canonicalTable(key, table, tableKeys, options.casing)])),
  };
};

module.exports = { IdentifierCasing, extractCanonicalSchema };
