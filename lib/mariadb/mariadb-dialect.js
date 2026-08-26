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
  MySqlCustomColumn: ColumnKind.Custom,
};

const TINYINT_MAX = 127;
const SMALLINT_MAX = 32_767;
const MEDIUMINT_MAX = 8_388_607;
const INT_MAX = 2_147_483_647;
const YEAR_MIN = 1_901;
const YEAR_MAX = 2_155;
const BIGINT_MAX = 9_223_372_036_854_775_807n;

const valueRanges = {
  MySqlTinyInt: { maxValue: TINYINT_MAX },
  MySqlSmallInt: { maxValue: SMALLINT_MAX },
  MySqlMediumInt: { maxValue: MEDIUMINT_MAX },
  MySqlInt: { maxValue: INT_MAX },
  // YEAR is the one mapped type with a floor above zero: the server rejects anything between
  // 1 and 1900, so a range starting at 0 would emit values a strict-mode server refuses.
  MySqlYear: { minValue: YEAR_MIN, maxValue: YEAR_MAX },
  MySqlSerial: { maxValue: Number.MAX_SAFE_INTEGER },
  MySqlBigInt53: { maxValue: Number.MAX_SAFE_INTEGER },
  MySqlBigInt64: { maxValue: BIGINT_MAX },
};

const boundedLength = (column) => (column.length === undefined ? {} : { maxLength: column.length });

const precisionAndScale = (column) =>
  column.precision === undefined ? {} : { precision: column.precision, scale: column.scale };

const declaredValues = (column) => ({ enumValues: [...column.enumValues] });

const noDetail = () => ({});

// MySQL's DATETIME and TIMESTAMP default to zero fractional digits and truncate anything finer,
// so a generated millisecond value would not survive the round trip.
const fractionalSeconds = (column) => ({ fractionalSecondDigits: column.fsp ?? 0 });

const declaredCustomType = (column) => ({ customType: column.getSQLType() });

const columnDetails = {
  [ColumnKind.Custom]: declaredCustomType,
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
  valueRange: (column) => valueRanges[column.columnType] ?? {},
  detail: (kind, column) => (columnDetails[kind] ?? noDetail)(column),
};
