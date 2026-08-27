const { describe, it } = require('node:test');
const { equal: eq, throws } = require('node:assert');
const { ColumnKind } = require('../lib');
// Module-private, required directly by its own test file, per the S09 convention.
const { serialiseCopyRow } = require('../lib/postgres/copy-text-serialisation');

const arrayColumn = (elementKind, detail = {}) => ({
  kind: ColumnKind.Array,
  propertyName: 'value',
  name: 'value',
  element: { kind: elementKind, jsType: 'string', ...detail },
});

const copied = (column, value) => serialiseCopyRow([column], { value }, 'probe').replace(/\n$/, '');

const TEXT = arrayColumn(ColumnKind.Text);

// The rules, written before the serialiser. Two layers apply in order: the array literal is
// built first (quoting elements per PostgreSQL's array syntax), then the whole literal passes
// through COPY's own escaping. A row is wrong if either layer is skipped or applied twice.
const RULES = [
  { name: 'a plain array needs no quoting at all', column: TEXT, value: ['alpha', 'beta'], expected: '{alpha,beta}' },
  { name: 'an empty array is a pair of braces, not null', column: TEXT, value: [], expected: '{}' },
  {
    name: "a null array is COPY's null marker, which an empty array must not collide with",
    column: TEXT,
    value: null,
    expected: '\\N',
  },
  { name: 'a null element is the bare word NULL', column: TEXT, value: ['alpha', null], expected: '{alpha,NULL}' },
  {
    name: 'an element which is the word NULL is quoted, so it stays a value',
    column: TEXT,
    value: ['NULL'],
    expected: '{"NULL"}',
  },
  { name: 'case does not save it: null is quoted too', column: TEXT, value: ['null'], expected: '{"null"}' },
  {
    name: 'an empty string element is quoted, telling it apart from NULL',
    column: TEXT,
    value: [''],
    expected: '{""}',
  },
  {
    name: 'a comma forces quoting, or it would read as two elements',
    column: TEXT,
    value: ['a,b'],
    expected: '{"a,b"}',
  },
  { name: 'braces force quoting', column: TEXT, value: ['{a}'], expected: '{"{a}"}' },
  {
    name: 'a double quote is backslash escaped inside quotes',
    column: TEXT,
    value: ['say "hi"'],
    expected: '{"say \\\\"hi\\\\""}',
  },
  {
    name: 'a backslash is doubled by the array layer, then again by COPY',
    column: TEXT,
    value: ['a\\b'],
    expected: '{"a\\\\\\\\b"}',
  },
  {
    name: 'leading whitespace forces quoting, since the parser would trim it',
    column: TEXT,
    value: [' a'],
    expected: '{" a"}',
  },
  {
    name: 'a tab is quoted by the array layer and escaped by COPY',
    column: TEXT,
    value: ['a\tb'],
    expected: '{"a\\tb"}',
  },
  { name: 'a newline likewise', column: TEXT, value: ['a\nb'], expected: '{"a\\nb"}' },
  { name: 'integers need no quoting', column: arrayColumn(ColumnKind.Integer), value: [1, 2, 3], expected: '{1,2,3}' },
  {
    name: 'booleans use the COPY spelling',
    column: arrayColumn(ColumnKind.Boolean),
    value: [true, false],
    expected: '{t,f}',
  },
  {
    name: 'timestamps keep the column formatting',
    column: arrayColumn(ColumnKind.Timestamp),
    value: [new Date('2024-06-01T12:30:45.123Z')],
    expected: '{"2024-06-01 12:30:45.123+00"}',
  },
  {
    name: 'a nested array is the same syntax, one level down',
    column: TEXT,
    value: [
      ['a', 'b'],
      ['c', 'd'],
    ],
    expected: '{{a,b},{c,d}}',
  },
  {
    name: 'nested quoting applies at the level that needs it',
    column: TEXT,
    value: [['a,b'], ['c']],
    expected: '{{"a,b"},{c}}',
  },
  { name: 'three levels are no different from two', column: TEXT, value: [[['a']]], expected: '{{{a}}}' },
];

describe('postgres array serialisation', () => {
  for (const rule of RULES) {
    it(rule.name, () => {
      eq(copied(rule.column, rule.value), rule.expected);
    });
  }

  it('refuses a ragged nested array, which the database would reject as malformed', () => {
    throws(() => copied(TEXT, [['a', 'b'], ['c']]), {
      name: 'RaggedArrayError',
      table: 'probe',
      column: 'value',
      message:
        'Column probe.value produced a nested array whose sub-arrays have lengths 2 and 1. ' +
        'PostgreSQL requires them to match. Generate sub-arrays of one length.',
    });
  });

  it('refuses a value which is not an array at all, naming the column', () => {
    throws(() => copied(TEXT, 'alpha,beta'), {
      name: 'UnserialisableValueError',
      table: 'probe',
      column: 'value',
    });
  });

  it('refuses an element the element kind cannot express', () => {
    throws(() => copied(arrayColumn(ColumnKind.Integer), ['not a number']), {
      name: 'UnserialisableValueError',
      table: 'probe',
      column: 'value',
    });
  });
});
