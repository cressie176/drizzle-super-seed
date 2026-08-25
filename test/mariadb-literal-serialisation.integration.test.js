const { describe, it, before, after } = require('node:test');
const { deepEqual: deq, equal: eq, ok } = require('node:assert');
const { ColumnKind } = require('../lib');
const { quotedIdentifier, serialiseInsertRow } = require('../lib/mariadb/mariadb-literal-serialisation');
const { executeScript, queryValue } = require('./lib/mariadb-database');

// §3.16 requires the literal escaping to be proved against a real server, not only against the
// unit tests' own expectations. The fixture's generated text is lowercase words, so nothing in
// the end-to-end load ever needs an escape; these are the values that do.
const AWKWARD = [
  "O'Hara",
  "''",
  'a\\b',
  '\\',
  "\\'",
  'a\nb',
  'a\r\nb',
  'a\tb',
  'a\0b',
  '',
  'trailing space ',
  ' leading space',
  '100% \\ complete',
  'quote " and backtick `',
  '{"note":"a\'b\\\\c"}',
];

const columns = [
  { name: 'id', propertyName: 'id', kind: ColumnKind.Integer, jsType: 'number' },
  { name: 'value', propertyName: 'value', kind: ColumnKind.Text, jsType: 'string' },
];

describe('mariadb literal serialisation', () => {
  before(async () => {
    await executeScript('DROP TABLE IF EXISTS escape_probe');
    await executeScript('CREATE TABLE escape_probe (id INT NOT NULL PRIMARY KEY, value VARBINARY(255) NOT NULL)');

    const rows = AWKWARD.map((value, id) => serialiseInsertRow('escapeProbe', columns, { id, value })).join(',\n');
    await executeScript(
      `INSERT INTO ${quotedIdentifier('escape_probe')} (${quotedIdentifier('id')}, ${quotedIdentifier('value')}) VALUES\n${rows};`,
    );
  });

  after(async () => {
    await executeScript('DROP TABLE IF EXISTS escape_probe');
  });

  describe('through the real client', () => {
    it('loads every awkward value', async () => {
      eq(await queryValue('SELECT COUNT(*) FROM escape_probe'), String(AWKWARD.length));
    });

    it('reads each one back byte for byte', async () => {
      // Compared as hex, so the transport cannot hide a difference the way a text column would.
      const expected = AWKWARD.map((value) => Buffer.from(value, 'utf8').toString('hex').toUpperCase());
      const actual = [];
      for (let id = 0; id < AWKWARD.length; id++) {
        actual.push(await queryValue(`SELECT HEX(value) FROM escape_probe WHERE id = ${id}`));
      }

      deq(actual, expected);
    });

    it('tells an empty string apart from NULL', async () => {
      await executeScript("INSERT INTO escape_probe (id, value) VALUES (100, '')");
      const empty = await queryValue("SELECT COUNT(*) FROM escape_probe WHERE value = '' AND value IS NOT NULL");

      eq(empty, '2');
    });

    it('quotes an identifier the server accepts', async () => {
      eq(quotedIdentifier('escape_probe'), '`escape_probe`');
      eq(
        await queryValue('SELECT COUNT(*) FROM `escape_probe`'),
        await queryValue('SELECT COUNT(*) FROM escape_probe'),
      );
    });
  });

  describe('the server mode the escaping assumes', () => {
    it('is not running NO_BACKSLASH_ESCAPES, which would read the escapes literally', async () => {
      const mode = await queryValue('SELECT @@sql_mode');

      ok(!mode.includes('NO_BACKSLASH_ESCAPES'), `sql_mode is ${mode}`);
    });
  });
});
