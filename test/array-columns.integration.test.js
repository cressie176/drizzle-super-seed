const { describe, it, before, after } = require('node:test');
const { deepEqual: deq, equal: eq } = require('node:assert');
const { Writable } = require('node:stream');
const { integer, pgTable, text } = require('drizzle-orm/pg-core');
const { TableLogging, TriggerHandling, createPostgresSqlStreamSink, derive, generate } = require('../lib');
const { executeScript, queryValue } = require('./lib/psql');

const SEED = 12;

// The values the escaping rules exist for, loaded through a real COPY rather than compared with
// the serialiser's own expectations.
const AWKWARD = [
  ['plain', 'values'],
  ['a,b'],
  ['say "hi"'],
  ['back\\slash'],
  ['tab\there'],
  ['new\nline'],
  ['{braced}'],
  [''],
  ['NULL'],
  ['null'],
  [' leading space'],
  ['alpha', null, 'gamma'],
  [],
  null,
  [
    ['nested', 'pair'],
    ['second', 'row'],
  ],
];

const probe = pgTable('array_probe', {
  id: integer('id').primaryKey(),
  values: text('values').array(),
});

describe('array columns through a real COPY', () => {
  before(async () => {
    const chunks = [];
    const writable = new Writable({
      write(chunk, _encoding, done) {
        chunks.push(String(chunk));
        done();
      },
    });
    await generate(
      {
        schema: { arrayProbe: probe },
        rules: {
          arrayProbe: {
            id: derive((_row, context) => context.rowIndex + 1),
            values: derive((_row, context) => AWKWARD[context.rowIndex]),
          },
        },
        counts: { arrayProbe: AWKWARD.length },
        seed: SEED,
      },
      createPostgresSqlStreamSink({
        writable,
        triggerHandling: TriggerHandling.LeaveEnabled,
        tableLogging: TableLogging.LeaveLogged,
      }),
    );

    await executeScript(
      [
        'DROP TABLE IF EXISTS array_probe;',
        'CREATE TABLE array_probe (id INTEGER PRIMARY KEY, "values" TEXT[]);',
        chunks.join(''),
      ].join('\n'),
    );
  });

  after(async () => {
    await executeScript('DROP TABLE IF EXISTS array_probe;');
  });

  it('loads every row', async () => {
    eq(await queryValue('SELECT COUNT(*) FROM array_probe'), String(AWKWARD.length));
  });

  it('reads back every element exactly, compared as hex so the transport cannot hide a difference', async () => {
    for (const [index, value] of AWKWARD.entries()) {
      if (value === null || value.length === 0 || Array.isArray(value[0])) continue;
      const elements = value.filter((element) => element !== null);
      const loaded = await queryValue(
        `SELECT string_agg(encode(convert_to(element, 'UTF8'), 'hex'), '|') FROM (
           SELECT unnest("values") AS element FROM array_probe WHERE id = ${index + 1}
         ) parts WHERE element IS NOT NULL`,
      );
      eq(loaded, elements.map((element) => Buffer.from(element, 'utf8').toString('hex')).join('|'), `row ${index + 1}`);
    }
  });

  it('tells an empty array apart from a null array', async () => {
    eq(await queryValue(`SELECT "values" = '{}' FROM array_probe WHERE id = 13`), 't');
    eq(await queryValue('SELECT "values" IS NULL FROM array_probe WHERE id = 14'), 't');
  });

  it('keeps a null element as a null, not the word', async () => {
    eq(await queryValue('SELECT array_length("values", 1) FROM array_probe WHERE id = 12'), '3');
    eq(await queryValue('SELECT "values"[2] IS NULL FROM array_probe WHERE id = 12'), 't');
  });

  it('keeps the string NULL as a string', async () => {
    eq(await queryValue('SELECT "values"[1] IS NULL FROM array_probe WHERE id = 9'), 'f');
    eq(await queryValue(`SELECT "values"[1] = 'NULL' FROM array_probe WHERE id = 9`), 't');
  });

  it('loads a nested array with its dimensions intact', async () => {
    eq(await queryValue('SELECT array_ndims("values") FROM array_probe WHERE id = 15'), '2');
    eq(await queryValue(`SELECT "values"[2][1] = 'second' FROM array_probe WHERE id = 15`), 't');
  });
});
