const { ColumnKind } = require('../canonical-schema');
const { UnserialisableValueError } = require('../generation-errors');

const NULL_MARKER = '\\N';
const COLUMN_SEPARATOR = '\t';
const ROW_TERMINATOR = '\n';

// Backslash must be escaped before the control characters, or the backslash this
// function itself introduces for a tab would be escaped a second time and the value
// would read back as the two characters "\t" rather than as a tab.
const escaped = (text) =>
  text.replaceAll('\\', '\\\\').replaceAll('\t', '\\t').replaceAll('\n', '\\n').replaceAll('\r', '\\r');

const unserialisable = (table, column, value) => {
  throw new UnserialisableValueError({ table, column: column.propertyName, value });
};

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const numeric = (value) => (typeof value === 'bigint' || isFiniteNumber(value) ? value.toString() : undefined);

const text = (value) => (typeof value === 'string' ? escaped(value) : undefined);

const numericOrText = (value) => numeric(value) ?? text(value);

const trueOrFalse = (value) => {
  if (typeof value !== 'boolean') return undefined;
  return value ? 't' : 'f';
};

const DATE_LENGTH = 'YYYY-MM-DD'.length;

const isoDate = (value) => value.toISOString().slice(0, DATE_LENGTH);

const TIMESTAMP_LENGTH = 'YYYY-MM-DDTHH:mm:ss.SSS'.length;
const UTC_OFFSET = '+00';

const isoTimestamp = (value) => `${value.toISOString().slice(0, TIMESTAMP_LENGTH).replace('T', ' ')}${UTC_OFFSET}`;

const dateOrText = (format) => (value) => (value instanceof Date ? format(value) : text(value));

const json = (value) => {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? undefined : escaped(encoded);
};

const byRuntimeType = (value) => {
  if (value instanceof Date) return isoTimestamp(value);
  return numeric(value) ?? text(value) ?? trueOrFalse(value);
};

const formatters = new Map([
  [ColumnKind.Integer, numeric],
  [ColumnKind.BigInt, numeric],
  [ColumnKind.Decimal, numericOrText],
  [ColumnKind.Real, numeric],
  [ColumnKind.Text, text],
  [ColumnKind.Boolean, trueOrFalse],
  [ColumnKind.Uuid, text],
  [ColumnKind.Date, dateOrText(isoDate)],
  [ColumnKind.Timestamp, dateOrText(isoTimestamp)],
  [ColumnKind.Time, text],
  [ColumnKind.Json, json],
  [ColumnKind.Enum, text],
  [ColumnKind.Custom, byRuntimeType],
]);

const isAbsent = (value) => value === null || value === undefined;

const serialiseValue = (table, column, value) => {
  if (isAbsent(value)) return NULL_MARKER;
  return formatters.get(column.kind)(value) ?? unserialisable(table, column, value);
};

const serialiseCopyRow = (columns, row, table) =>
  `${columns.map((column) => serialiseValue(table, column, row[column.propertyName])).join(COLUMN_SEPARATOR)}${ROW_TERMINATOR}`;

module.exports = { serialiseCopyRow };
