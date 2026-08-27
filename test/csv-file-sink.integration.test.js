const { describe, it, before, after } = require('node:test');
const { equal: eq } = require('node:assert');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { boolean, integer, pgTable, text, timestamp } = require('drizzle-orm/pg-core');
const { createCsvFileSink, derive, generate } = require('../lib');
const { executeScript, queryValue } = require('./lib/psql');

const SEED = 5;

const AWKWARD = [
  'plain',
  'comma, separated',
  'quoted "twice" over',
  'line\nbreak',
  'carriage\rreturn',
  '', // the empty string, which must stay distinct from NULL
  null,
];

const probe = pgTable('csv_probe', {
  id: integer('id').primaryKey(),
  content: text('content'),
  flag: boolean('flag').notNull(),
  at: timestamp('at', { withTimezone: true }),
});

const rules = {
  csvProbe: {
    id: derive((_row, context) => context.rowIndex + 1),
    content: derive((_row, context) => AWKWARD[context.rowIndex]),
    flag: derive((_row, context) => context.rowIndex % 2 === 0),
    at: () => new Date('2024-06-01T12:30:45.123Z'),
  },
};

describe('csv files through a real COPY', () => {
  let directory;

  before(async () => {
    directory = await mkdtemp(join(tmpdir(), 'drizzle-super-seed-'));
    await generate(
      { schema: { csvProbe: probe }, rules, counts: { csvProbe: AWKWARD.length }, seed: SEED },
      createCsvFileSink({ directory }),
    );

    const csv = await readFile(join(directory, 'seed-00010_csvProbe.csv'), 'utf8');
    await executeScript(
      [
        'SET TIME ZONE UTC;',
        'DROP TABLE IF EXISTS csv_probe;',
        'CREATE TABLE csv_probe (id INTEGER PRIMARY KEY, content TEXT, flag BOOLEAN NOT NULL, at TIMESTAMPTZ);',
        "COPY csv_probe (id, content, flag, at) FROM stdin WITH (FORMAT csv, HEADER true, NULL '');",
        // No \. terminator: it is a text-format marker, and CSV mode reads it as data. The
        // stream's end is the end of the data.
        csv,
      ].join('\n'),
    );
  });

  after(async () => {
    await executeScript('DROP TABLE IF EXISTS csv_probe;');
    await rm(directory, { recursive: true, force: true });
  });

  it('loads every generated row', async () => {
    eq(await queryValue('SELECT COUNT(*) FROM csv_probe'), String(AWKWARD.length));
  });

  it('reads back every awkward value exactly as generated', async () => {
    // Compared as hex, so the transport cannot hide a difference a text comparison might.
    for (const [index, value] of AWKWARD.entries()) {
      if (value === null) continue;
      const loaded = await queryValue(
        `SELECT encode(convert_to(content, 'UTF8'), 'hex') FROM csv_probe WHERE id = ${index + 1}`,
      );
      eq(loaded, Buffer.from(value, 'utf8').toString('hex'), `row ${index + 1} did not round-trip`);
    }
  });

  it('tells the empty string apart from null', async () => {
    eq(await queryValue("SELECT content = '' FROM csv_probe WHERE id = 6"), 't');
    eq(await queryValue('SELECT content IS NULL FROM csv_probe WHERE id = 7'), 't');
  });

  it('loads booleans and timestamps as their own types', async () => {
    eq(await queryValue('SELECT flag FROM csv_probe WHERE id = 1'), 't');
    eq(await queryValue("SELECT at = '2024-06-01T12:30:45.123Z'::timestamptz FROM csv_probe WHERE id = 1"), 't');
  });
});
