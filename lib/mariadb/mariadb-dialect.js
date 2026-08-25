const { is } = require('drizzle-orm');
const { MySqlTable, getTableConfig } = require('drizzle-orm/mysql-core');
const { ColumnKind, Dialect } = require('../canonical-schema');

const columnKinds = {
  MySqlTinyInt: ColumnKind.Integer,
  MySqlSmallInt: ColumnKind.Integer,
  MySqlMediumInt: ColumnKind.Integer,
  MySqlInt: ColumnKind.Integer,
  MySqlYear: ColumnKind.Integer,
  MySqlSerial: ColumnKind.BigInt,
  MySqlBigInt53: ColumnKind.BigInt,
  MySqlBigInt64: ColumnKind.BigInt,
  MySqlDecimal: ColumnKind.Decimal,
  MySqlDecimalNumber: ColumnKind.Decimal,
  MySqlDecimalBigInt: ColumnKind.Decimal,
  MySqlFloat: ColumnKind.Real,
  MySqlDouble: ColumnKind.Real,
  MySqlReal: ColumnKind.Real,
  MySqlVarChar: ColumnKind.Text,
  MySqlChar: ColumnKind.Text,
  MySqlText: ColumnKind.Text,
  MySqlBinary: ColumnKind.Text,
  MySqlVarBinary: ColumnKind.Text,
  MySqlBoolean: ColumnKind.Boolean,
  MySqlDate: ColumnKind.Date,
  MySqlDateString: ColumnKind.Date,
  MySqlDateTime: ColumnKind.Timestamp,
  MySqlDateTimeString: ColumnKind.Timestamp,
  MySqlTimestamp: ColumnKind.Timestamp,
  MySqlTimestampString: ColumnKind.Timestamp,
  MySqlTime: ColumnKind.Time,
  MySqlJson: ColumnKind.Json,
  MySqlEnumColumn: ColumnKind.Enum,
};

const TINYINT_MAX = 127;
const SMALLINT_MAX = 32_767;
const MEDIUMINT_MAX = 8_388_607;
const INT_MAX = 2_147_483_647;
const YEAR_MAX = 2_155;
const BIGINT_MAX = 9_223_372_036_854_775_807n;

const largestValues = {
  MySqlTinyInt: TINYINT_MAX,
  MySqlSmallInt: SMALLINT_MAX,
  MySqlMediumInt: MEDIUMINT_MAX,
  MySqlInt: INT_MAX,
  MySqlYear: YEAR_MAX,
  MySqlSerial: Number.MAX_SAFE_INTEGER,
  MySqlBigInt53: Number.MAX_SAFE_INTEGER,
  MySqlBigInt64: BIGINT_MAX,
};

const boundedLength = (column) => (column.length === undefined ? {} : { maxLength: column.length });

const precisionAndScale = (column) =>
  column.precision === undefined ? {} : { precision: column.precision, scale: column.scale };

const declaredValues = (column) => ({ enumValues: [...column.enumValues] });

const noDetail = () => ({});

// MySQL's DATETIME and TIMESTAMP default to zero fractional digits and truncate anything finer,
// so a generated millisecond value would not survive the round trip.
const fractionalSeconds = (column) => ({ fractionalSecondDigits: column.fsp ?? 0 });

const columnDetails = {
  [ColumnKind.Text]: boundedLength,
  [ColumnKind.Decimal]: precisionAndScale,
  [ColumnKind.Enum]: declaredValues,
  [ColumnKind.Timestamp]: fractionalSeconds,
};

module.exports = {
  dialect: Dialect.MariaDb,
  isTable: (value) => is(value, MySqlTable),
  tableConfig: (table) => getTableConfig(table),
  columnKind: (column) => columnKinds[column.columnType],
  sequenceOwned: (column) => Boolean(column.autoIncrement),
  // MySQL has no GENERATED ALWAYS AS IDENTITY: AUTO_INCREMENT always accepts an explicit value.
  identityAlways: () => false,
  largestValue: (column) => (column.columnType in largestValues ? { maxValue: largestValues[column.columnType] } : {}),
  detail: (kind, column) => (columnDetails[kind] ?? noDetail)(column),
};
