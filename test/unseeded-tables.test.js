const { describe, it } = require('node:test');
const { once } = require('node:events');
const { deepEqual: deq, ok, rejects } = require('node:assert');
const { integer, pgTable, varchar } = require('drizzle-orm/pg-core');
const {
  createInMemoryGraphSink,
  derive,
  generate,
  structuralDefault,
  structuralDefaults,
  unseeded,
} = require('../lib');

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
        rules: { parks: { id: rowNumber, name: structuralDefault }, audits: { [unseeded]: true } },
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
          rules: { parks: { id: rowNumber, name: structuralDefault }, audits: { [unseeded]: true } },
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

describe('table annotations', () => {
  const seedParksWith = (parkRules) =>
    generate(
      {
        schema: { parks, audits },
        rules: { parks: parkRules, audits: { [unseeded]: true } },
        counts: { parks: 2 },
        seed: SEED,
      },
      createInMemoryGraphSink(),
    );

  it('takes the structural default for every column the table does not name', async () => {
    const data = await seedParksWith({ [structuralDefaults]: true, id: rowNumber });

    deq(
      data.rows.parks.map((park) => park.id),
      [1, 2],
    );
    for (const park of data.rows.parks) ok(typeof park.name === 'string' && park.name.length > 0);
  });

  it('names nothing at all, and still generates every column', async () => {
    const data = await seedParksWith({ [structuralDefaults]: true });

    ok(data.rows.parks.every((park) => typeof park.id === 'number' && typeof park.name === 'string'));
  });

  it('still refuses an unannotated table that omits a column', async () => {
    await rejects(seedParksWith({ id: rowNumber }), { name: 'MissingColumnRuleError', column: 'name' });
  });

  it('cannot be confused with a column of the same name, the keys being symbols', () => {
    const awkward = { [structuralDefaults]: true, structuralDefaults: 'a column rule' };

    deq(Object.keys(awkward), ['structuralDefaults']);
    ok(awkward[structuralDefaults] === true);
  });

  it('refuses an unseeded table that also declares column rules', async () => {
    await rejects(
      generate(
        {
          schema: { parks, audits },
          rules: {
            parks: { id: rowNumber, name: structuralDefault },
            audits: { [unseeded]: true, note: structuralDefault },
          },
          counts: { parks: 2 },
          seed: SEED,
        },
        createInMemoryGraphSink(),
      ),
      { name: 'UnseededTableRuledError', table: 'audits', declared: ['note'] },
    );
  });

  it('refuses an unseeded table that also asks for structural defaults', async () => {
    await rejects(
      generate(
        {
          schema: { parks, audits },
          rules: {
            parks: { id: rowNumber, name: structuralDefault },
            audits: { [unseeded]: true, [structuralDefaults]: true },
          },
          counts: { parks: 2 },
          seed: SEED,
        },
        createInMemoryGraphSink(),
      ),
      { name: 'UnseededTableRuledError', declared: ['structuralDefaults'] },
    );
  });
});

describe('the deprecated bare unseeded value', () => {
  it('still works, and warns once naming the table and the replacement', async () => {
    const warned = once(process, 'warning');

    const data = await generate(
      {
        schema: { parks, audits },
        rules: { parks: { id: rowNumber, name: structuralDefault }, audits: unseeded },
        counts: { parks: 2, audits: 1 },
        seed: SEED,
      },
      createInMemoryGraphSink(),
    ).catch((error) => error);

    ok(data instanceof Error);
    const [warning] = await warned;
    deq(warning.name, 'DeprecationWarning');
    ok(warning.message.includes('audits'));
    ok(warning.message.includes('{ [unseeded]: true }'));
  });
});
