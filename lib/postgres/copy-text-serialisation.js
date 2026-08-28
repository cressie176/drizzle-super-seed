const { ColumnKind } = require('../canonical-schema');
const { UnserialisableValueError, VectorDimensionMismatchError } = require('../generation-errors');
const { arrayLiteral } = require('./array-literal');

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

const text = (value) => (typeof value === 'string' ? value : undefined);

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

const json = (value) => JSON.stringify(value);

// A boolean column takes 't' or '1' equally, but a numeric one takes only '1', and a customType
// column tells us nothing about which it wraps: `dataType()` returns an arbitrary dialect string.
// The numeric spelling is therefore the safe one here, and it is what the MariaDB and CSV sinks
// already write. Real Boolean columns keep 't' and 'f', which is the idiomatic COPY spelling and
// is unambiguous because their type is known.
const oneOrZero = (value) => {
  if (typeof value !== 'boolean') return undefined;
  return value ? '1' : '0';
};

const byRuntimeType = (value) => {
  if (value instanceof Date) return isoTimestamp(value);
  return numeric(value) ?? text(value) ?? oneOrZero(value);
};

// pgvector's literal is bracketed and comma separated - deliberately not the brace form a
// PostgreSQL array uses, which is why vectors are their own kind rather than an array of reals.
const requireDeclaredLength = (tableKey, column, value) => {
  if (column.dimensions === undefined || value.length === column.dimensions) return;
  throw new VectorDimensionMismatchError({
    table: tableKey,
    column: column.propertyName,
    expected: column.dimensions,
    actual: value.length,
  });
};

const vectorLiteral = (value, column, tableKey) => {
  if (!Array.isArray(value)) return undefined;
  requireDeclaredLength(tableKey, column, value);
  return `[${value.map((component) => (Number.isFinite(component) ? String(component) : undefined)).join(',')}]`;
};

// The element is formatted by its own kind, then the array layer quotes it, then the whole
// literal goes through COPY's escaping below - the order matters, because COPY unescapes
// before the array parser runs.
const arrayValue = (value, column, table) => {
  if (!Array.isArray(value)) return undefined;
  const formatElement = (element) =>
    formatters.get(column.element.kind)(element, column.element, table) ?? unserialisable(table, column, element);
  return arrayLiteral(value, table, column, formatElement);
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
  [ColumnKind.Vector, vectorLiteral],
  [ColumnKind.Array, arrayValue],
]);

const isAbsent = (value) => value === null || value === undefined;

// Escaping is applied once, here, to whatever the formatter produced: an array's elements are
// quoted by the array layer first, and COPY unescapes before the array parser runs, so escaping
// inside a formatter would be undone at the wrong level.
const serialiseValue = (table, column, value) => {
  if (isAbsent(value)) return NULL_MARKER;
  const formatted = formatters.get(column.kind)(value, column, table) ?? unserialisable(table, column, value);
  return escaped(formatted);
};

const serialiseCopyRow = (columns, row, table) =>
  `${columns.map((column) => serialiseValue(table, column, row[column.propertyName])).join(COLUMN_SEPARATOR)}${ROW_TERMINATOR}`;

module.exports = { serialiseCopyRow };
