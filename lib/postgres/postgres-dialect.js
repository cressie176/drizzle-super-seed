const { is } = require('drizzle-orm');
const { PgTable, getTableConfig } = require('drizzle-orm/pg-core');
const { ColumnKind, Dialect } = require('../canonical-schema');

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

const SMALLINT_MAX = 32_767;
const INTEGER_MAX = 2_147_483_647;
const BIGINT_MAX = 9_223_372_036_854_775_807n;

const largestValues = {
  PgSmallInt: SMALLINT_MAX,
  PgSmallSerial: SMALLINT_MAX,
  PgInteger: INTEGER_MAX,
  PgSerial: INTEGER_MAX,
  PgBigInt53: Number.MAX_SAFE_INTEGER,
  PgBigSerial53: Number.MAX_SAFE_INTEGER,
  PgBigInt64: BIGINT_MAX,
  PgBigSerial64: BIGINT_MAX,
};

const boundedLength = (column) => (column.length === undefined ? {} : { maxLength: column.length });

const precisionAndScale = (column) =>
  column.precision === undefined ? {} : { precision: column.precision, scale: column.scale };

const declaredValues = (column) => ({ enumValues: [...column.enumValues] });

// A JavaScript Date carries milliseconds, so anything from three digits up is lossless and the
// field is omitted; PostgreSQL's own default is six.
const timezoneAwareness = (column) => ({
  withTimezone: column.withTimezone,
  ...(column.precision === undefined || column.precision >= 3 ? {} : { fractionalSecondDigits: column.precision }),
});

const noDetail = () => ({});

const columnDetails = {
  [ColumnKind.Text]: boundedLength,
  [ColumnKind.Decimal]: precisionAndScale,
  [ColumnKind.Enum]: declaredValues,
  [ColumnKind.Timestamp]: timezoneAwareness,
};

module.exports = {
  dialect: Dialect.Postgres,
  isTable: (value) => is(value, PgTable),
  tableConfig: (table) => getTableConfig(table),
  columnKind: (column) => columnKinds[column.columnType],
  sequenceOwned: (column) => sequenceColumnTypes.has(column.columnType) || Boolean(column.generatedIdentity),
  identityAlways: (column) => column.generatedIdentity?.type === 'always',
  largestValue: (column) => (column.columnType in largestValues ? { maxValue: largestValues[column.columnType] } : {}),
  detail: (kind, column) => (columnDetails[kind] ?? noDetail)(column),
};
