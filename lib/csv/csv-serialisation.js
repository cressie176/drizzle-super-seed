const { ColumnKind } = require('../canonical-schema');
const { UnserialisableValueError } = require('../generation-errors');

const FIELD_SEPARATOR = ',';
const ROW_TERMINATOR = '\n';
const QUOTE = '"';

const needsQuoting = (field, nullToken) =>
  field === '' ||
  field === nullToken ||
  field.includes(FIELD_SEPARATOR) ||
  field.includes(QUOTE) ||
  field.includes('\n') ||
  field.includes('\r');

// RFC 4180 quoting, with two additions COPY csv needs to round-trip: the empty string is always
// quoted (an unquoted empty field is NULL), and a value equal to the null token is quoted (a
// quoted null token is a value, a bare one is NULL).
const csvField = (field, nullToken) =>
  needsQuoting(field, nullToken) ? `${QUOTE}${field.replaceAll(QUOTE, QUOTE + QUOTE)}${QUOTE}` : field;

const unserialisable = (tableKey, column, value) => {
  throw new UnserialisableValueError({ table: tableKey, column: column.propertyName, value });
};

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const numeric = (value) => (typeof value === 'bigint' || isFiniteNumber(value) ? value.toString() : undefined);

const text = (value) => (typeof value === 'string' ? value : undefined);

const numericOrText = (value) => numeric(value) ?? text(value);

// 1 and 0 load as boolean in PostgreSQL and as tinyint(1) in MariaDB; 'true' would not.
const oneOrZero = (value) => {
  if (typeof value !== 'boolean') return undefined;
  return value ? '1' : '0';
};

const DATE_LENGTH = 'YYYY-MM-DD'.length;

const isoDate = (value) => value.toISOString().slice(0, DATE_LENGTH);

// RFC 3339 with the Z designator, exactly as toISOString emits it. The file is an interchange
// artefact first, so the instant is unambiguous in the text rather than depending on the
// reader's session configuration; a loader which cannot parse a zone suffix must convert.
const rfc3339Timestamp = (value) => value.toISOString();

const dateOrText = (format) => (value) => (value instanceof Date ? format(value) : text(value));

const json = (value) => JSON.stringify(value);

const byRuntimeType = (value) => {
  if (value instanceof Date) return rfc3339Timestamp(value);
  return numeric(value) ?? text(value) ?? oneOrZero(value);
};

const formatters = new Map([
  [ColumnKind.Integer, numeric],
  [ColumnKind.BigInt, numeric],
  [ColumnKind.Decimal, numericOrText],
  [ColumnKind.Real, numeric],
  [ColumnKind.Text, text],
  [ColumnKind.Boolean, oneOrZero],
  [ColumnKind.Uuid, text],
  [ColumnKind.Date, dateOrText(isoDate)],
  [ColumnKind.Timestamp, dateOrText(rfc3339Timestamp)],
  [ColumnKind.Time, text],
  [ColumnKind.Json, json],
  [ColumnKind.Enum, text],
  [ColumnKind.Custom, byRuntimeType],
]);

const isAbsent = (value) => value === null || value === undefined;

const serialiseValue = (tableKey, column, value, { nullToken }) => {
  if (isAbsent(value)) return nullToken;
  const formatted = formatters.get(column.kind)(value) ?? unserialisable(tableKey, column, value);
  return csvField(formatted, nullToken);
};

const serialiseCsvRow = (columns, row, tableKey, options) =>
  `${columns.map((column) => serialiseValue(tableKey, column, row[column.propertyName], options)).join(FIELD_SEPARATOR)}${ROW_TERMINATOR}`;

const serialiseCsvHeader = (columns) =>
  `${columns.map((column) => csvField(column.name, undefined)).join(FIELD_SEPARATOR)}${ROW_TERMINATOR}`;

module.exports = { serialiseCsvHeader, serialiseCsvRow };
