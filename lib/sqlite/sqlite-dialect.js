const { is } = require('drizzle-orm');
const { SQLiteTable, getTableConfig } = require('drizzle-orm/sqlite-core');
const { ColumnKind, Dialect } = require('../canonical-schema');

const columnKinds = {
  SQLiteInteger: ColumnKind.Integer,
  SQLiteBoolean: ColumnKind.Boolean,
  SQLiteTimestamp: ColumnKind.Timestamp,
  SQLiteText: ColumnKind.Text,
  SQLiteTextJson: ColumnKind.Json,
  SQLiteBlobJson: ColumnKind.Json,
  SQLiteCustomColumn: ColumnKind.Custom,
  SQLiteBigInt: ColumnKind.BigInt,
  SQLiteReal: ColumnKind.Real,
  SQLiteNumeric: ColumnKind.Decimal,
  SQLiteNumericNumber: ColumnKind.Decimal,
  SQLiteNumericBigInt: ColumnKind.Decimal,
};

const SQLITE_INTEGER_MAX = 9_223_372_036_854_775_807n;

const valueRanges = {
  SQLiteInteger: { maxValue: Number.MAX_SAFE_INTEGER },
  SQLiteBigInt: { maxValue: SQLITE_INTEGER_MAX },
};

const boundedLength = (column) => (column.length === undefined ? {} : { maxLength: column.length });

const noDetail = () => ({});

// integer({ mode: 'timestamp' }) stores whole Unix seconds; timestamp_ms keeps milliseconds.
const fractionalSeconds = (column) => ({ fractionalSecondDigits: column.mode === 'timestamp_ms' ? 3 : 0 });

const declaredCustomType = (column) => ({ customType: column.getSQLType() });

const columnDetails = {
  [ColumnKind.Custom]: declaredCustomType,
  [ColumnKind.Text]: boundedLength,
  [ColumnKind.Timestamp]: fractionalSeconds,
};

// SQLite's INTEGER PRIMARY KEY is an alias for the rowid, so it is assigned automatically whether
// or not AUTOINCREMENT is declared.
const rowIdAlias = (column) => column.primary && column.columnType === 'SQLiteInteger';

module.exports = {
  dialect: Dialect.Sqlite,
  isTable: (value) => is(value, SQLiteTable),
  tableConfig: (table) => getTableConfig(table),
  columnKind: (column) => columnKinds[column.columnType],
  sequenceOwned: (column) => Boolean(column.autoIncrement) || rowIdAlias(column),
  identityAlways: () => false,
  valueRange: (column) => valueRanges[column.columnType] ?? {},
  detail: (kind, column) => (columnDetails[kind] ?? noDetail)(column),
};
