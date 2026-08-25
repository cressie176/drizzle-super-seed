const { ColumnKind } = require('../canonical-schema');
const { UnserialisableValueError } = require('../generation-errors');

const NULL_LITERAL = 'NULL';

// Backslash first, for the same reason as §3.14's COPY escaping: the escapes introduced below all
// begin with one, and escaping it afterwards would double them.
const escaped = (text) =>
  text
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "''")
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t')
    .replaceAll('\0', '\\0');

const quoted = (text) => `'${escaped(text)}'`;

const quotedIdentifier = (name) => `\`${name.replaceAll('`', '``')}\``;

const unserialisable = (table, column, value) => {
  throw new UnserialisableValueError({ table, column: column.propertyName, value });
};

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const numeric = (value) => (typeof value === 'bigint' || isFiniteNumber(value) ? value.toString() : undefined);

const text = (value) => (typeof value === 'string' ? quoted(value) : undefined);

const numericOrText = (value) => numeric(value) ?? text(value);

const trueOrFalse = (value) => {
  if (typeof value !== 'boolean') return undefined;
  return value ? '1' : '0';
};

const DATE_LENGTH = 'YYYY-MM-DD'.length;
const DATETIME_LENGTH = 'YYYY-MM-DDTHH:mm:ss.SSS'.length;
const MICROSECOND_PADDING = '000';

const isoDate = (value) => quoted(value.toISOString().slice(0, DATE_LENGTH));

const isoDateTime = (value) =>
  quoted(`${value.toISOString().slice(0, DATETIME_LENGTH).replace('T', ' ')}${MICROSECOND_PADDING}`);

const dateOrText = (format) => (value) => (value instanceof Date ? format(value) : text(value));

const json = (value) => {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? undefined : quoted(encoded);
};

const literals = new Map([
  [ColumnKind.Integer, numeric],
  [ColumnKind.BigInt, numeric],
  [ColumnKind.Decimal, numericOrText],
  [ColumnKind.Real, numeric],
  [ColumnKind.Text, text],
  [ColumnKind.Boolean, trueOrFalse],
  [ColumnKind.Uuid, text],
  [ColumnKind.Date, dateOrText(isoDate)],
  [ColumnKind.Timestamp, dateOrText(isoDateTime)],
  [ColumnKind.Time, text],
  [ColumnKind.Json, json],
  [ColumnKind.Enum, text],
]);

const isAbsent = (value) => value === null || value === undefined;

const serialiseLiteral = (table, column, value) => {
  if (isAbsent(value)) return NULL_LITERAL;
  return literals.get(column.kind)(value) ?? unserialisable(table, column, value);
};

const serialiseInsertRow = (table, columns, row) =>
  `(${columns.map((column) => serialiseLiteral(table, column, row[column.propertyName])).join(',')})`;

module.exports = { quotedIdentifier, serialiseInsertRow, serialiseLiteral };
