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
  PgCustomColumn: ColumnKind.Custom,
  PgVector: ColumnKind.Vector,
};

const sequenceColumnTypes = new Set(['PgSerial', 'PgSmallSerial', 'PgBigSerial53', 'PgBigSerial64']);

const SMALLINT_MAX = 32_767;
const INTEGER_MAX = 2_147_483_647;
const BIGINT_MAX = 9_223_372_036_854_775_807n;

const valueRanges = {
  PgSmallInt: { maxValue: SMALLINT_MAX },
  PgSmallSerial: { maxValue: SMALLINT_MAX },
  PgInteger: { maxValue: INTEGER_MAX },
  PgSerial: { maxValue: INTEGER_MAX },
  PgBigInt53: { maxValue: Number.MAX_SAFE_INTEGER },
  PgBigSerial53: { maxValue: Number.MAX_SAFE_INTEGER },
  PgBigInt64: { maxValue: BIGINT_MAX },
  PgBigSerial64: { maxValue: BIGINT_MAX },
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

const declaredCustomType = (column) => ({ customType: column.getSQLType() });

const declaredDimensions = (column) => (column.dimensions === undefined ? {} : { dimensions: column.dimensions });

const columnDetails = {
  [ColumnKind.Custom]: declaredCustomType,
  [ColumnKind.Vector]: declaredDimensions,
  [ColumnKind.Text]: boundedLength,
  [ColumnKind.Decimal]: precisionAndScale,
  [ColumnKind.Enum]: declaredValues,
  [ColumnKind.Timestamp]: timezoneAwareness,
};

// drizzle-kit pull renders a serial as integer().default(sql`nextval('name'::regclass)`): the
// column drives the sequence but the catalogue does not own it, so pg_get_serial_sequence
// returns NULL and the finalise file must setval by the name captured here instead.
const NEXTVAL_DEFAULT = /^nextval\('([^']+)'/;

const nextvalSequenceName = (column) => {
  const chunk = column.default?.queryChunks?.[0]?.value?.[0];
  if (typeof chunk !== 'string') return undefined;
  return NEXTVAL_DEFAULT.exec(chunk)?.[1];
};

module.exports = {
  dialect: Dialect.Postgres,
  isTable: (value) => is(value, PgTable),
  tableConfig: (table) => getTableConfig(table),
  columnKind: (column) => columnKinds[column.columnType],
  sequenceOwned: (column) =>
    sequenceColumnTypes.has(column.columnType) ||
    Boolean(column.generatedIdentity) ||
    nextvalSequenceName(column) !== undefined,
  sequenceName: nextvalSequenceName,
  identityAlways: (column) => column.generatedIdentity?.type === 'always',
  valueRange: (column) => valueRanges[column.columnType] ?? {},
  detail: (kind, column) => (columnDetails[kind] ?? noDetail)(column),
};
