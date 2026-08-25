const { describe, it } = require('node:test');
const { equal: eq, throws } = require('node:assert');
const { ColumnKind } = require('../lib');
// The serialiser is module-private; a module's own test file may require it directly (S09).
const { serialiseCsvHeader, serialiseCsvRow } = require('../lib/csv/csv-serialisation');

const column = (kind, propertyName = 'value') => ({ kind, propertyName, name: propertyName });

const serialised = (kind, value, options = {}) =>
  serialiseCsvRow([column(kind)], { value }, 'probe', { nullToken: '', ...options });

// The rules, written before the serialiser existed. Quoting is RFC 4180 with the two additions
// PostgreSQL's COPY csv needs to round-trip: an empty string is always quoted (unquoted empty is
// NULL), and a value equal to the null token is quoted (a quoted null token is a value).
const RULES = [
  { name: 'plain text passes through unquoted', kind: ColumnKind.Text, value: 'greenacres', expected: 'greenacres\n' },
  { name: 'a comma forces quoting', kind: ColumnKind.Text, value: 'a,b', expected: '"a,b"\n' },
  {
    name: 'a double quote is doubled, and forces quoting',
    kind: ColumnKind.Text,
    value: 'say "hi"',
    expected: '"say ""hi"""\n',
  },
  {
    name: 'a newline is kept inside a quoted field',
    kind: ColumnKind.Text,
    value: 'two\nlines',
    expected: '"two\nlines"\n',
  },
  {
    name: 'a carriage return is kept inside a quoted field',
    kind: ColumnKind.Text,
    value: 'a\rb',
    expected: '"a\rb"\n',
  },
  {
    name: 'a tab needs no quoting, because the delimiter is the comma',
    kind: ColumnKind.Text,
    value: 'a\tb',
    expected: 'a\tb\n',
  },
  {
    name: 'the empty string is quoted, telling it apart from null',
    kind: ColumnKind.Text,
    value: '',
    expected: '""\n',
  },
  { name: 'null is the bare null token', kind: ColumnKind.Text, value: null, expected: '\n' },
  { name: 'undefined is null', kind: ColumnKind.Text, value: undefined, expected: '\n' },
  {
    name: 'a custom null token is emitted bare',
    kind: ColumnKind.Text,
    value: null,
    options: { nullToken: '\\N' },
    expected: '\\N\n',
  },
  {
    name: 'a value equal to the null token is quoted, so it stays a value',
    kind: ColumnKind.Text,
    value: '\\N',
    options: { nullToken: '\\N' },
    expected: '"\\N"\n',
  },
  { name: 'an integer is plain digits', kind: ColumnKind.Integer, value: 42, expected: '42\n' },
  {
    name: 'a bigint is plain digits',
    kind: ColumnKind.BigInt,
    value: 9007199254740993n,
    expected: '9007199254740993\n',
  },
  { name: 'a decimal string passes through', kind: ColumnKind.Decimal, value: '129.95', expected: '129.95\n' },
  { name: 'a real is its shortest round-trip form', kind: ColumnKind.Real, value: 0.5, expected: '0.5\n' },
  { name: 'true is 1, valid to postgres and mysql alike', kind: ColumnKind.Boolean, value: true, expected: '1\n' },
  { name: 'false is 0', kind: ColumnKind.Boolean, value: false, expected: '0\n' },
  {
    name: 'a uuid passes through',
    kind: ColumnKind.Uuid,
    value: '5b1c…-not-checked-here',
    expected: '5b1c…-not-checked-here\n',
  },
  {
    name: 'a date is its calendar day',
    kind: ColumnKind.Date,
    value: new Date('2024-06-01T00:00:00Z'),
    expected: '2024-06-01\n',
  },
  {
    name: 'a date column generated as a string passes through',
    kind: ColumnKind.Date,
    value: '2024-06-01',
    expected: '2024-06-01\n',
  },
  {
    name: 'a timestamp is space separated with no zone suffix, loadable by both dialects',
    kind: ColumnKind.Timestamp,
    value: new Date('2024-06-01T12:30:45.123Z'),
    expected: '2024-06-01 12:30:45.123\n',
  },
  { name: 'a time passes through', kind: ColumnKind.Time, value: '12:30:45', expected: '12:30:45\n' },
  {
    name: 'json is serialised then csv quoted',
    kind: ColumnKind.Json,
    value: { a: 1, b: 'x' },
    expected: '"{""a"":1,""b"":""x""}"\n',
  },
  { name: 'an enum value passes through', kind: ColumnKind.Enum, value: 'confirmed', expected: 'confirmed\n' },
];

describe('csv value serialisation', () => {
  for (const rule of RULES) {
    it(rule.name, () => {
      eq(serialised(rule.kind, rule.value, rule.options), rule.expected);
    });
  }

  it('joins a row with commas and terminates it with a newline', () => {
    const columns = [column(ColumnKind.Integer, 'id'), column(ColumnKind.Text, 'name')];
    eq(serialiseCsvRow(columns, { id: 7, name: 'a,b' }, 'probe', { nullToken: '' }), '7,"a,b"\n');
  });

  it('refuses a value the column kind cannot express, naming table and column', () => {
    throws(() => serialised(ColumnKind.Integer, 'not a number'), {
      name: 'UnserialisableValueError',
      table: 'probe',
      column: 'value',
    });
  });

  it('writes a header of database column names, csv escaped', () => {
    const columns = [
      { kind: ColumnKind.Integer, propertyName: 'id', name: 'id' },
      { kind: ColumnKind.Text, propertyName: 'oddName', name: 'odd,name' },
    ];
    eq(serialiseCsvHeader(columns), 'id,"odd,name"\n');
  });
});
