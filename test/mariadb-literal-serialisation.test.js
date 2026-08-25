const { describe, it } = require('node:test');
const { equal: eq, throws } = require('node:assert');
const { ColumnKind } = require('../lib');
const {
  serialiseInsertRow,
  serialiseLiteral,
  quotedIdentifier,
} = require('../lib/mariadb/mariadb-literal-serialisation');

const QUOTE = "'";
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

const serialise = (kind, value, fields) => serialiseLiteral('probe', column(kind, fields), value);

// §3.16's literal rules as a table, written before the serialiser existed.
const LITERALS = [
  { of: 'a plain string', kind: ColumnKind.Text, value: 'Greenacres', expected: "'Greenacres'" },
  { of: 'an empty string', kind: ColumnKind.Text, value: '', expected: "''" },
  { of: 'null', kind: ColumnKind.Text, value: null, expected: 'NULL' },
  { of: 'undefined', kind: ColumnKind.Text, value: undefined, expected: 'NULL' },
  { of: 'a single quote', kind: ColumnKind.Text, value: "O'Hara", expected: "'O''Hara'" },
  { of: 'two single quotes', kind: ColumnKind.Text, value: "''", expected: "''''''" },
  { of: 'a backslash', kind: ColumnKind.Text, value: `a${BACKSLASH}b`, expected: `'a${BACKSLASH}${BACKSLASH}b'` },
  {
    of: 'a backslash before a quote',
    kind: ColumnKind.Text,
    value: `${BACKSLASH}${QUOTE}`,
    expected: `'${BACKSLASH}${BACKSLASH}${QUOTE}${QUOTE}'`,
  },
  { of: 'a newline', kind: ColumnKind.Text, value: 'a\nb', expected: "'a\\nb'" },
  { of: 'a carriage return', kind: ColumnKind.Text, value: 'a\rb', expected: "'a\\rb'" },
  { of: 'a tab', kind: ColumnKind.Text, value: 'a\tb', expected: "'a\\tb'" },
  { of: 'a null byte', kind: ColumnKind.Text, value: 'a\0b', expected: "'a\\0b'" },
  { of: 'true', kind: ColumnKind.Boolean, value: true, expected: '1' },
  { of: 'false', kind: ColumnKind.Boolean, value: false, expected: '0' },
  { of: 'a whole number', kind: ColumnKind.Integer, value: 42, expected: '42' },
  { of: 'a negative number', kind: ColumnKind.Integer, value: -42, expected: '-42' },
  { of: 'a fractional number', kind: ColumnKind.Real, value: -3.5, expected: '-3.5' },
  { of: 'a bigint', kind: ColumnKind.BigInt, value: 9_007_199_254_740_993n, expected: '9007199254740993' },
  { of: 'a decimal string', kind: ColumnKind.Decimal, value: '123.45', expected: "'123.45'" },
  { of: 'a decimal number', kind: ColumnKind.Decimal, value: 123.45, expected: '123.45' },
  {
    of: 'a datetime',
    kind: ColumnKind.Timestamp,
    value: new Date('2024-06-01T22:45:13.789Z'),
    expected: "'2024-06-01 22:45:13.789000'",
  },
  {
    of: 'a datetime string',
    kind: ColumnKind.Timestamp,
    value: '2024-06-01 22:45:13',
    expected: "'2024-06-01 22:45:13'",
  },
  { of: 'a date', kind: ColumnKind.Date, value: new Date('2024-06-01T22:45:13.789Z'), expected: "'2024-06-01'" },
  { of: 'a date string', kind: ColumnKind.Date, value: '2024-06-01', expected: "'2024-06-01'" },
  { of: 'a time', kind: ColumnKind.Time, value: '22:45:13', expected: "'22:45:13'" },
  { of: 'an enum value', kind: ColumnKind.Enum, value: 'cancelled', expected: "'cancelled'" },
  { of: 'an empty json object', kind: ColumnKind.Json, value: {}, expected: "'{}'" },
  {
    of: 'json containing a quote and a backslash',
    kind: ColumnKind.Json,
    value: { note: `a'b${BACKSLASH}c` },
    expected: `'{"note":"a''b${BACKSLASH}${BACKSLASH}${BACKSLASH}${BACKSLASH}c"}'`,
  },
];

const UNSERIALISABLE = [
  { of: 'not a number', kind: ColumnKind.Real, value: Number.NaN },
  { of: 'infinity', kind: ColumnKind.Real, value: Number.POSITIVE_INFINITY },
  { of: 'a number in a text column', kind: ColumnKind.Text, value: 42 },
  { of: 'a string in a boolean column', kind: ColumnKind.Boolean, value: 'true' },
  { of: 'a symbol', kind: ColumnKind.Text, value: Symbol('nope') },
];

describe('mariadb literal serialisation', () => {
  describe('values', () => {
    for (const { of, kind, value, expected } of LITERALS) {
      it(`serialises ${of}`, () => {
        eq(serialise(kind, value), expected);
      });
    }

    it('tells an empty string apart from null', () => {
      eq(serialise(ColumnKind.Text, ''), "''");
      eq(serialise(ColumnKind.Text, null), 'NULL');
    });

    it('escapes the backslash before the quote, so a quote does not read back as a backslash', () => {
      eq(serialise(ColumnKind.Text, BACKSLASH), `'${BACKSLASH}${BACKSLASH}'`);
    });
  });

  describe('identifiers', () => {
    it('wraps an identifier in backticks', () => {
      eq(quotedIdentifier('holiday_homes'), '`holiday_homes`');
    });

    it('doubles a backtick inside an identifier', () => {
      eq(quotedIdentifier('od`d'), '`od``d`');
    });
  });

  describe('rows', () => {
    const columns = [
      column(ColumnKind.Integer, { name: 'id', propertyName: 'id', jsType: 'number' }),
      column(ColumnKind.Text, { name: 'name', propertyName: 'name' }),
      column(ColumnKind.Boolean, { name: 'active', propertyName: 'active', jsType: 'boolean' }),
    ];

    it('parenthesises the values, comma separated, in column order', () => {
      eq(serialiseInsertRow('parks', columns, { id: 1, name: 'Greenacres', active: true }), "(1,'Greenacres',1)");
    });

    it('reads each column by its property name', () => {
      const renamed = [column(ColumnKind.Text, { name: 'opened_at', propertyName: 'openedAt' })];

      eq(serialiseInsertRow('parks', renamed, { openedAt: '1972-04-11' }), "('1972-04-11')");
    });

    it('writes NULL for an absent value', () => {
      eq(serialiseInsertRow('parks', columns, { id: 2, name: null, active: false }), '(2,NULL,0)');
    });
  });

  describe('unserialisable values', () => {
    for (const { of, kind, value } of UNSERIALISABLE) {
      it(`rejects ${of}`, () => {
        throws(() => serialise(kind, value), { name: 'UnserialisableValueError' });
      });
    }

    it('names the table, the column and the value', () => {
      throws(() => serialiseLiteral('pitches', column(ColumnKind.Real, { propertyName: 'areaSqm' }), Number.NaN), {
        name: 'UnserialisableValueError',
        table: 'pitches',
        column: 'areaSqm',
        value: 'NaN',
      });
    });
  });
});
