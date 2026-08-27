const { RaggedArrayError } = require('../generation-errors');

const NEEDS_QUOTING = /[,{}"\\\s]/;

const NULL_ELEMENT = 'NULL';

const isNullish = (value) => value === null || value === undefined;

// An element is quoted when the array parser would otherwise misread it: because it contains
// syntax, because it is empty, or because it spells NULL and would be read as one.
const needsQuoting = (element) =>
  element === '' || element.toUpperCase() === NULL_ELEMENT || NEEDS_QUOTING.test(element);

const quoted = (element) => `"${element.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

const arrayElement = (element) => (needsQuoting(element) ? quoted(element) : element);

// PostgreSQL requires a multidimensional array to be rectangular, and rejects a ragged literal
// as malformed; this names the column while the value is still in hand.
const requireRectangular = (values, table, column) => {
  const lengths = values.filter(Array.isArray).map((value) => value.length);
  if (lengths.length === 0 || new Set(lengths).size <= 1) return;
  throw new RaggedArrayError({ table, column: column.propertyName, lengths: [...new Set(lengths)] });
};

// Nesting is the same syntax one level down, so the literal is built recursively; PostgreSQL
// accepts any depth in any array column, whatever dimension the schema declares.
const arrayLiteral = (values, table, column, formatElement) => {
  requireRectangular(values, table, column);
  const parts = values.map((value) => {
    if (Array.isArray(value)) return arrayLiteral(value, table, column, formatElement);
    if (isNullish(value)) return NULL_ELEMENT;
    return arrayElement(formatElement(value));
  });
  return `{${parts.join(',')}}`;
};

module.exports = { arrayLiteral };
