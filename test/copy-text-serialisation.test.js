const { describe, it } = require('node:test');
const { equal: eq, throws } = require('node:assert');
const { ColumnKind } = require('../lib');
const { serialiseCopyRow } = require('../lib/postgres/copy-text-serialisation');

const TAB = '\t';
const NEWLINE = '\n';
const CARRIAGE_RETURN = '\r';
const BACKSLASH = '\\';

const column = (kind, fields = {}) => ({
  name: 'value',
  propertyName: 'value',
  kind,
  jsType: 'string',
  notNull: false,
  hasDatabaseDefault: false,
  isPrimaryKey: false,
  sequenceOwned: false,
  identityAlways: false,
  ...fields,
});

const serialise = (kind, value, fields) => serialiseCopyRow([column(kind, fields)], { value });

// The escaping rules of §3.14, as a table, so the serialiser is written to them rather than
// the other way round. `expected` is the exact text COPY must receive, including its terminator.
const ESCAPING = [
  { of: 'a plain string', kind: ColumnKind.Text, value: 'Greenacres', expected: 'Greenacres' },
  { of: 'an empty string', kind: ColumnKind.Text, value: '', expected: '' },
  { of: 'null', kind: ColumnKind.Text, value: null, expected: `${BACKSLASH}N` },
  { of: 'undefined', kind: ColumnKind.Text, value: undefined, expected: `${BACKSLASH}N` },
  { of: 'a tab', kind: ColumnKind.Text, value: `a${TAB}b`, expected: `a${BACKSLASH}tb` },
  { of: 'a newline', kind: ColumnKind.Text, value: `a${NEWLINE}b`, expected: `a${BACKSLASH}nb` },
  {
    of: 'a carriage return',
    kind: ColumnKind.Text,
    value: `a${CARRIAGE_RETURN}b`,
    expected: `a${BACKSLASH}rb`,
  },
  {
    of: 'a backslash',
    kind: ColumnKind.Text,
    value: `a${BACKSLASH}b`,
    expected: `a${BACKSLASH}${BACKSLASH}b`,
  },
  {
    of: 'the two characters which spell the null marker',
    kind: ColumnKind.Text,
    value: `${BACKSLASH}N`,
    expected: `${BACKSLASH}${BACKSLASH}N`,
  },
  {
    of: 'the two characters which spell an escaped tab',
    kind: ColumnKind.Text,
    value: `${BACKSLASH}t`,
    expected: `${BACKSLASH}${BACKSLASH}t`,
  },
  {
    of: 'a backslash and a tab together',
    kind: ColumnKind.Text,
    value: `${BACKSLASH}${TAB}`,
    expected: `${BACKSLASH}${BACKSLASH}${BACKSLASH}t`,
  },
  { of: 'true', kind: ColumnKind.Boolean, value: true, expected: 't' },
  { of: 'false', kind: ColumnKind.Boolean, value: false, expected: 'f' },
  { of: 'a whole number', kind: ColumnKind.Integer, value: 42, expected: '42' },
  { of: 'a negative number', kind: ColumnKind.Integer, value: -42, expected: '-42' },
  { of: 'zero', kind: ColumnKind.Integer, value: 0, expected: '0' },
  { of: 'a fractional number', kind: ColumnKind.Real, value: -3.5, expected: '-3.5' },
  {
    of: 'a bigint beyond safe integer range',
    kind: ColumnKind.BigInt,
    value: 9_007_199_254_740_993n,
    expected: '9007199254740993',
  },
  { of: 'a decimal string', kind: ColumnKind.Decimal, value: '123.45', expected: '123.45' },
  { of: 'a decimal number', kind: ColumnKind.Decimal, value: 123.45, expected: '123.45' },
  { of: 'a decimal bigint', kind: ColumnKind.Decimal, value: 12345n, expected: '12345' },
  { of: 'a date string', kind: ColumnKind.Date, value: '2024-06-01', expected: '2024-06-01' },
  {
    of: 'a date object',
    kind: ColumnKind.Date,
    value: new Date('2024-06-01T22:45:13.789Z'),
    expected: '2024-06-01',
  },
  {
    of: 'a timestamp object',
    kind: ColumnKind.Timestamp,
    value: new Date('2024-06-01T22:45:13.789Z'),
    expected: '2024-06-01 22:45:13.789+00',
  },
  {
    of: 'a timestamp object on a whole second',
    kind: ColumnKind.Timestamp,
    value: new Date('2024-06-01T00:00:00.000Z'),
    expected: '2024-06-01 00:00:00.000+00',
  },
  {
    of: 'a timestamp string',
    kind: ColumnKind.Timestamp,
    value: '2024-06-01 22:45:13.789+00',
    expected: '2024-06-01 22:45:13.789+00',
  },
  { of: 'a time', kind: ColumnKind.Time, value: '22:45:13', expected: '22:45:13' },
  {
    of: 'a uuid',
    kind: ColumnKind.Uuid,
    value: '0f8fad5b-d9cb-469f-a165-70867728950e',
    expected: '0f8fad5b-d9cb-469f-a165-70867728950e',
  },
  { of: 'an enum value', kind: ColumnKind.Enum, value: 'cancelled', expected: 'cancelled' },
  { of: 'an empty json object', kind: ColumnKind.Json, value: {}, expected: '{}' },
  {
    of: 'a json object',
    kind: ColumnKind.Json,
    value: { electricity: true, pitches: 12 },
    expected: '{"electricity":true,"pitches":12}',
  },
  { of: 'a json array', kind: ColumnKind.Json, value: [1, 'two'], expected: '["two"]'.replace('[', '[1,') },
  {
    of: 'json containing a tab, a newline and a backslash',
    kind: ColumnKind.Json,
    value: { note: `a${TAB}b${NEWLINE}c${BACKSLASH}d` },
    expected: `{"note":"a${BACKSLASH}${BACKSLASH}tb${BACKSLASH}${BACKSLASH}nc${BACKSLASH}${BACKSLASH}${BACKSLASH}${BACKSLASH}d"}`,
  },
];

const UNSERIALISABLE = [
  { of: 'not a number', kind: ColumnKind.Real, value: Number.NaN },
  { of: 'positive infinity', kind: ColumnKind.Real, value: Number.POSITIVE_INFINITY },
  { of: 'negative infinity', kind: ColumnKind.Real, value: Number.NEGATIVE_INFINITY },
  { of: 'a string in an integer column', kind: ColumnKind.Integer, value: '42' },
  { of: 'a number in a text column', kind: ColumnKind.Text, value: 42 },
  { of: 'a date in a text column', kind: ColumnKind.Text, value: new Date() },
  { of: 'a string in a boolean column', kind: ColumnKind.Boolean, value: 'true' },
  { of: 'a number in a date column', kind: ColumnKind.Date, value: 20_240_601 },
  { of: 'a function in a json column', kind: ColumnKind.Json, value: () => 1 },
  { of: 'a symbol', kind: ColumnKind.Text, value: Symbol('nope') },
];

describe('copy text serialisation', () => {
  describe('values', () => {
    for (const { of, kind, value, expected } of ESCAPING) {
      it(`serialises ${of}`, () => {
        eq(serialise(kind, value), `${expected}\n`);
      });
    }

    it('tells an empty string apart from null', () => {
      eq(serialise(ColumnKind.Text, ''), '\n');
      eq(serialise(ColumnKind.Text, null), `${BACKSLASH}N\n`);
    });

    it('escapes the backslash before the tab, so a tab does not read back as a backslash', () => {
      eq(serialise(ColumnKind.Text, TAB), `${BACKSLASH}t\n`);
      eq(serialise(ColumnKind.Text, `${BACKSLASH}t`), `${BACKSLASH}${BACKSLASH}t\n`);
    });
  });

  describe('rows', () => {
    const columns = [
      column(ColumnKind.Integer, { name: 'id', propertyName: 'id', jsType: 'number' }),
      column(ColumnKind.Text, { name: 'name', propertyName: 'name' }),
      column(ColumnKind.Boolean, { name: 'active', propertyName: 'active', jsType: 'boolean' }),
    ];

    it('joins the columns with tabs and terminates the row with a newline', () => {
      eq(serialiseCopyRow(columns, { id: 1, name: 'Greenacres', active: true }), '1\tGreenacres\tt\n');
    });

    it('serialises the columns in the order it is given, not the order of the row', () => {
      eq(serialiseCopyRow(columns, { active: false, name: 'Sandy Cove', id: 2 }), '2\tSandy Cove\tf\n');
    });

    it('reads each column by its property name', () => {
      const renamed = [column(ColumnKind.Text, { name: 'opened_at', propertyName: 'openedAt' })];

      eq(serialiseCopyRow(renamed, { openedAt: '1972-04-11' }), '1972-04-11\n');
    });

    it('serialises a row of a single null column', () => {
      eq(serialiseCopyRow([column(ColumnKind.Text)], { value: null }), `${BACKSLASH}N\n`);
    });

    it('separates two nulls with a tab', () => {
      const pair = [
        column(ColumnKind.Text, { name: 'left', propertyName: 'left' }),
        column(ColumnKind.Text, { name: 'right', propertyName: 'right' }),
      ];

      eq(serialiseCopyRow(pair, { left: null, right: null }), `${BACKSLASH}N\t${BACKSLASH}N\n`);
    });
  });

  describe('unserialisable values', () => {
    for (const { of, kind, value } of UNSERIALISABLE) {
      it(`rejects ${of}`, () => {
        throws(() => serialise(kind, value), { name: 'UnserialisableValueError' });
      });
    }

    it('names the table, the column and the value it could not serialise', () => {
      const columns = [column(ColumnKind.Real, { name: 'area_sqm', propertyName: 'areaSqm', jsType: 'number' })];

      throws(() => serialiseCopyRow(columns, { areaSqm: Number.NaN }, 'pitches'), {
        name: 'UnserialisableValueError',
        message:
          'Column pitches.areaSqm holds NaN, which cannot be written to a PostgreSQL COPY stream. ' +
          'Correct the rule which produced it, or the override which pinned it.',
        table: 'pitches',
        column: 'areaSqm',
        value: 'NaN',
      });
    });

    it('describes an unsupported value by its type', () => {
      const columns = [column(ColumnKind.Text, { name: 'name', propertyName: 'name' })];

      throws(() => serialiseCopyRow(columns, { name: 42 }, 'parks'), {
        name: 'UnserialisableValueError',
        message:
          'Column parks.name holds the number 42, which cannot be written to a PostgreSQL COPY stream. ' +
          'Correct the rule which produced it, or the override which pinned it.',
        table: 'parks',
        column: 'name',
        value: '42',
      });
    });
  });
});
