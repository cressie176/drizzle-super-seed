const { describe, it } = require('node:test');
const { deepEqual: deq, ok, rejects } = require('node:assert');
const { integer, pgTable, varchar } = require('drizzle-orm/pg-core');
const { createInMemoryGraphSink, derive, generate, structuralDefault, unseeded } = require('../lib');

const SEED = 12;

const parks = pgTable('parks', {
  id: integer('id').primaryKey(),
  name: varchar('name', { length: 30 }).notNull(),
});

const audits = pgTable('audits', {
  id: integer('id').primaryKey(),
  note: varchar('note', { length: 80 }).notNull(),
});

const rowNumber = derive((_row, context) => context.rowIndex + 1);

describe('unseeded tables', () => {
  it('lets a run seed a subset, with the skipped table declared rather than omitted', async () => {
    const data = await generate(
      {
        schema: { parks, audits },
        rules: { parks: { id: rowNumber, name: structuralDefault }, audits: unseeded },
        counts: { parks: 2 },
        seed: SEED,
      },
      createInMemoryGraphSink(),
    );

    deq(Object.keys(data.report.rowCounts), ['parks']);
    ok(!('audits' in data.rows));
  });

  it('refuses the contradiction of an unseeded table with a count, naming the fix', async () => {
    await rejects(
      generate(
        {
          schema: { parks, audits },
          rules: { parks: { id: rowNumber, name: structuralDefault }, audits: unseeded },
          counts: { parks: 2, audits: 5 },
          seed: SEED,
        },
        createInMemoryGraphSink(),
      ),
      {
        name: 'UnseededTableCountedError',
        table: 'audits',
        message:
          'Table audits is marked unseeded in the rules, but counts asks for rows. ' +
          'Remove the count, or replace unseeded with a rules object.',
      },
    );
  });

  it('still refuses a counted table with no rules entry at all', async () => {
    await rejects(
      generate(
        {
          schema: { parks, audits },
          rules: { parks: { id: rowNumber, name: structuralDefault } },
          counts: { parks: 2, audits: 5 },
          seed: SEED,
        },
        createInMemoryGraphSink(),
      ),
      { name: 'MissingTableRulesError' },
    );
  });
});
