const { getTableColumns, is } = require('drizzle-orm');
const { toCamelCase, toSnakeCase } = require('drizzle-orm/casing');
const { PgTable, getTableConfig } = require('drizzle-orm/pg-core');
const { ColumnKind } = require('./column-kind');
const { UnsupportedColumnTypeError } = require('./generation-errors');

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

const schemaName = (config) => (config.schema === undefined ? {} : { schemaName: config.schema });

const canonicalTable = (key, table, casing) => {
  const config = getTableConfig(table);
  return {
    key,
    name: config.name,
    ...schemaName(config),
    columns: canonicalColumns(config, table, casing),
    primaryKey: [],
    foreignKeys: [],
    uniqueConstraints: [],
    drizzleTable: table,
  };
};

const extractCanonicalSchema = (schema, options = {}) => {
  const tables = new Map();
  for (const [key, value] of Object.entries(schema)) {
    if (!is(value, PgTable)) continue;
    tables.set(key, canonicalTable(key, value, options.casing));
  }
  return { tables };
};

module.exports = { IdentifierCasing, extractCanonicalSchema };
