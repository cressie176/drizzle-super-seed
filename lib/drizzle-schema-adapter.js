const { getTableColumns } = require('drizzle-orm');
const { extractDeclaredRelations } = require('./declared-relations');
const { ColumnKind } = require('./canonical-schema');
const { toCamelCase, toSnakeCase } = require('drizzle-orm/casing');
const {
  EmptySchemaError,
  IncompleteSchemaError,
  MixedDialectError,
  UnsupportedColumnTypeError,
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

// An array's element is described by the same seams as any column: its kind, its JavaScript
// representation, and whatever detail that kind carries, so varchar(64)[] keeps its length and
// an enum array keeps its values. Nesting recurses, because PostgreSQL accepts any depth.
// drizzle-orm 1.0.0 widened Column.dataType from a single token ("date") to a space-separated
// compound ("object date", "string uuid"). The base token names the JavaScript representation,
// except for object-backed columns, where the subtype does; 0.x tokens pass through unchanged.
const jsTypeOf = (dataType) => {
  const [base, sub] = dataType.split(' ');
  return base === 'object' ? sub : base;
};

const elementDescription = (dialect, tableKey, propertyName, column) => {
  const baseColumn = column.baseColumn;
  const kind = kindOf(dialect, tableKey, propertyName, baseColumn);
  return {
    element: {
      kind,
      jsType: jsTypeOf(baseColumn.dataType),
      ...dialect.detail(kind, baseColumn),
      ...(kind === ColumnKind.Array ? elementDescription(dialect, tableKey, propertyName, baseColumn) : {}),
    },
  };
};

const arrayDetail = (dialect, tableKey, propertyName, column, kind) =>
  kind === ColumnKind.Array ? elementDescription(dialect, tableKey, propertyName, column) : {};

const canonicalColumn = (dialect, tableKey, propertyName, column, casing) => {
  const kind = kindOf(dialect, tableKey, propertyName, column);
  return {
    name: databaseName(column, casing),
    propertyName,
    kind,
    jsType: jsTypeOf(column.dataType),
    notNull: column.notNull,
    hasDatabaseDefault: column.hasDefault,
    isPrimaryKey: column.primary,
    sequenceOwned: dialect.sequenceOwned(column),
    ...(dialect.sequenceName?.(column) === undefined ? {} : { sequenceName: dialect.sequenceName(column) }),
    identityAlways: dialect.identityAlways(column),
    ...dialect.valueRange(column),
    ...dialect.detail(kind, column),
    ...arrayDetail(dialect, tableKey, propertyName, column, kind),
  };
};

// A GENERATED ALWAYS AS column (stored or virtual) can never be supplied by any insert form,
// unlike an identity column, which accepts OVERRIDING SYSTEM VALUE. It leaves the model
// entirely: no rule is expected, no sink writes it, and drizzle's own $inferInsert agrees.
const isComputed = ([, column]) => column.generated !== undefined;

const canonicalColumns = (dialect, key, table, casing) =>
  Object.entries(getTableColumns(table))
    .filter((entry) => !isComputed(entry))
    .map(([propertyName, column]) => canonicalColumn(dialect, key, propertyName, column, casing));

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

// drizzle records a check as a name and an opaque SQL expression: the predicate is raw dialect
// text, so nothing here tries to understand it. What is recoverable, and all that is needed, is
// which columns it constrains and the text to quote back at whoever has to satisfy it. The
// expression interleaves literal fragments with column references, so reading the chunks gives
// both.
const isStringChunk = (chunk) => typeof chunk?.value?.join === 'function';

const isColumnChunk = (chunk) => typeof chunk?.name === 'string';

// Two spellings reach the same place. A hand-written check interpolates its columns, so they
// arrive as chunks. An introspected one, as drizzle-kit pull emits it, is a single opaque string
// with bare identifiers in it, so the only way to find them is to look for the table's own column
// names in the text. Matching whole words against a known set is the whole of the guesswork: a
// false positive asks for a rule that was not needed, never the other way round.
const IDENTIFIER_BOUNDARY = /[A-Za-z0-9_]/;

// A column name inside a string literal is a value, not a reference: `state IN ('queued', 'sent')`
// constrains state, not a column called sent. Blanking the literals first is what keeps the match
// to identifiers.
const SQL_STRING_LITERAL = /'(?:[^']|'')*'/g;

const withoutStringLiterals = (predicate) => predicate.replace(SQL_STRING_LITERAL, "''");

const mentionsIdentifier = (text, name) => {
  for (let at = text.indexOf(name); at !== -1; at = text.indexOf(name, at + 1)) {
    const before = text[at - 1];
    const after = text[at + name.length];
    if (!IDENTIFIER_BOUNDARY.test(before ?? '') && !IDENTIFIER_BOUNDARY.test(after ?? '')) return true;
  }
  return false;
};

const referencedColumns = (check, columns, casing) =>
  check.value.queryChunks.filter(isColumnChunk).map((chunk) => databaseName(chunk, casing));

const namedColumns = (predicate, columns) => {
  const searchable = withoutStringLiterals(predicate);
  return columns.filter((name) => mentionsIdentifier(searchable, name));
};

const checkColumns = (check, columns, predicate, casing) => [
  ...referencedColumns(check, columns, casing),
  ...namedColumns(predicate, columns),
];

const checkPredicate = (check, casing) =>
  check.value.queryChunks
    .map((chunk) => {
      if (isStringChunk(chunk)) return chunk.value.join('');
      if (isColumnChunk(chunk)) return databaseName(chunk, casing);
      return '?';
    })
    .join('')
    .trim();

const canonicalCheckConstraints = (config, columnNames, casing) =>
  (config.checks ?? []).map((check) => {
    const predicate = checkPredicate(check, casing);
    return {
      name: check.name,
      columns: [...new Set(checkColumns(check, columnNames, predicate, casing))],
      predicate,
    };
  });

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

// A unique index constrains the table exactly as a unique constraint does, and schemas in the
// wild (and drizzle-kit pull output) declare uniqueness mostly this way. A partial index
// (WHERE) is not a table-wide constraint and an expression index has no columns to track, so
// both are skipped; drizzle's index API carries no NULLS NOT DISTINCT, so these track NULLs as
// distinct, PostgreSQL's own default.
const isPlainColumn = (entry) => typeof entry.name === 'string';

const uniqueIndexConstraints = (config, casing) =>
  (config.indexes ?? [])
    .map((index) => index.config)
    .filter((index) => index.unique && !index.where && index.columns.every(isPlainColumn))
    .map((index) => uniqueConstraint(databaseNames(index.columns, casing), false));

const uniqueConstraintsOf = (config, table, casing) => [
  ...columnUniqueConstraints(table, casing),
  ...declaredUniqueConstraints(config, casing),
  ...uniqueIndexConstraints(config, casing),
];

const propertyNameOf = (columns, name) => columns.find((column) => column.name === name).propertyName;

const propertyNames = (columns, referenceColumns, casing) =>
  referenceColumns.map((column) => propertyNameOf(columns, databaseName(column, casing)));

const referencedTableKey = (dialect, key, propertyName, foreignTable, tableKeys) => {
  const referencedKey = tableKeys.get(foreignTable);
  if (referencedKey !== undefined) return referencedKey;
  throw new IncompleteSchemaError({
    table: key,
    column: propertyName,
    referencedTable: dialect.tableConfig(foreignTable).name,
  });
};

const canonicalForeignKey = (dialect, key, columns, reference, tableKeys, casing) => {
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

// A composite reference is recorded, not refused: dependency ordering and the UNLOGGED file
// need the edge, and rules resolution names the tuple when structuralDefault is asked to pick
// members it cannot pick independently.
const canonicalCompositeForeignKey = (dialect, key, columns, reference, tableKeys, casing) => {
  const names = reference.columns.map((column) => databaseName(column, casing));
  return {
    columns: names,
    referencedTableKey: referencedTableKey(
      dialect,
      key,
      propertyNameOf(columns, names[0]),
      reference.foreignTable,
      tableKeys,
    ),
    referencedColumns: reference.foreignColumns.map((column) => databaseName(column, casing)),
  };
};

const referencesOf = (config) => config.foreignKeys.map((foreignKey) => foreignKey.reference());

const canonicalForeignKeys = (dialect, key, columns, config, tableKeys, casing) =>
  referencesOf(config)
    .filter((reference) => reference.columns.length === 1)
    .map((reference) => canonicalForeignKey(dialect, key, columns, reference, tableKeys, casing));

const canonicalCompositeForeignKeys = (dialect, key, columns, config, tableKeys, casing) =>
  referencesOf(config)
    .filter((reference) => reference.columns.length > 1)
    .map((reference) => canonicalCompositeForeignKey(dialect, key, columns, reference, tableKeys, casing));

const schemaName = (config) => (config.schema === undefined ? {} : { schemaName: config.schema });

const asPrimaryKeyMember = (column) => ({ ...column, notNull: true, isPrimaryKey: true });

// A primary key member is NOT NULL in the database whether or not the column says so. drizzle
// carries notNull per column, but a table-level primaryKey() makes its members mandatory without
// touching them, so a schema that declares the key once and never repeats .notNull() would
// otherwise be modelled as nullable and seeded with nulls the database rejects.
const withinPrimaryKey = (primaryKey) => (column) => {
  if (!primaryKey.includes(column.name)) return column;
  return asPrimaryKeyMember(column);
};

const canonicalTable = (dialect, key, table, tableKeys, casing) => {
  const config = dialect.tableConfig(table);
  const primaryKey = primaryKeyOf(config, table, casing);
  const columns = canonicalColumns(dialect, key, table, casing).map(withinPrimaryKey(primaryKey));
  return {
    key,
    name: config.name,
    ...schemaName(config),
    columns,
    primaryKey,
    foreignKeys: canonicalForeignKeys(dialect, key, columns, config, tableKeys, casing),
    compositeForeignKeys: canonicalCompositeForeignKeys(dialect, key, columns, config, tableKeys, casing),
    uniqueConstraints: uniqueConstraintsOf(config, table, casing),
    checkConstraints: canonicalCheckConstraints(
      config,
      columns.map((column) => column.name),
      casing,
    ),
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

// A schema module with no recognisable tables is almost never intent: it is a wrong import path,
// or a duplicated drizzle-orm in node_modules, which makes is(value, PgTable) false for every
// real table and the whole schema *look* empty. Refusing loudly here names both causes; the old
// behaviour generated nothing, silently.
const soleDialect = (schema) => {
  const present = dialectsPresent(schema);
  if (present.length === 0) throw new EmptySchemaError();
  if (present.length === 1) return present[0];
  throw new MixedDialectError({
    dialects: present.map(({ dialect }) => dialect.dialect),
    tables: tablesByDialect(present),
  });
};

const keysByTableIdentity = (entries) => new Map(entries.map(([key, table]) => [table, key]));

const extractCanonicalSchema = (schema, options = {}) => {
  const { dialect, entries } = soleDialect(schema);
  const tableKeys = keysByTableIdentity(entries);
  const tables = new Map(
    entries.map(([key, table]) => [key, canonicalTable(dialect, key, table, tableKeys, options.casing)]),
  );
  return {
    dialect: dialect.dialect,
    tables,
    relations: extractDeclaredRelations(schema, tableKeys, tables),
  };
};

module.exports = { IdentifierCasing, extractCanonicalSchema };
