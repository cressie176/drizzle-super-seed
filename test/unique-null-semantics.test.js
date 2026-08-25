const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, ok, rejects } = require('node:assert');
const { integer, pgTable, unique, varchar } = require('drizzle-orm/pg-core');
const {
  createInMemoryGraphSink,
  extractCanonicalSchema,
  generate,
  optional,
  randomInteger,
  structuralDefault,
} = require('../lib');

const SEED = 42;
const REFERENCE_DATE = new Date('2024-06-01T00:00:00.000Z');

// Every dialect this library supports defaults to NULLS DISTINCT, so a unique constraint admits
// any number of rows holding a NULL. PostgreSQL 15+ can opt out per constraint.
const sightings = pgTable(
  'sightings',
  {
    id: integer('id').primaryKey(),
    tagCode: varchar('tag_code', { length: 20 }),
    note: varchar('note', { length: 20 }),
  },
  (table) => [unique('sightings_tag_code_key').on(table.tagCode)],
);

const strictSightings = pgTable(
  'strict_sightings',
  {
    id: integer('id').primaryKey(),
    tagCode: varchar('tag_code', { length: 20 }),
  },
  (table) => [unique('strict_sightings_tag_code_key').on(table.tagCode).nullsNotDistinct()],
);

const pairs = pgTable(
  'pairs',
  {
    id: integer('id').primaryKey(),
    left: integer('left'),
    right: integer('right'),
  },
  (table) => [unique('pairs_left_right_key').on(table.left, table.right)],
);

// A plain ValueGenerator receives the context alone; derive() is the two-argument form.
const rowNumber = (context) => context.rowIndex + 1;

const generateRows = (schema, rules, counts) =>
  generate({ schema, rules, counts, seed: SEED, referenceDate: REFERENCE_DATE }, createInMemoryGraphSink());

describe('unique constraints and NULL', () => {
  describe('the canonical model', () => {
    it('records whether a constraint counts its nulls', () => {
      const canonical = extractCanonicalSchema({ sightings, strictSightings });

      deq(canonical.tables.get('sightings').uniqueConstraints, [{ columns: ['tag_code'], nullsNotDistinct: false }]);
      deq(canonical.tables.get('strictSightings').uniqueConstraints, [
        { columns: ['tag_code'], nullsNotDistinct: true },
      ]);
    });

    it('records it for the column level shorthand too', () => {
      const probe = pgTable('probe', {
        id: integer('id').primaryKey(),
        plain: integer('plain').unique(),
        strict: integer('strict').unique('probe_strict_key', { nulls: 'not distinct' }),
      });

      deq(extractCanonicalSchema({ probe }).tables.get('probe').uniqueConstraints, [
        { columns: ['plain'], nullsNotDistinct: false },
        { columns: ['strict'], nullsNotDistinct: true },
      ]);
    });
  });

  describe('a nullable unique column', () => {
    const rules = {
      sightings: { id: rowNumber, tagCode: optional(randomInteger(1, 1_000_000), 0.5), note: structuralDefault },
    };

    it('emits nulls at the rate the rule asks for, however many rows', async () => {
      const graph = await generateRows({ sightings }, rules, { sightings: 400 });
      const nulls = graph.rows.sightings.filter((row) => row.tagCode === null).length;

      ok(Math.abs(nulls / 400 - 0.5) < 0.06, `${nulls} of 400 were null`);
    });

    it('still rejects a duplicate non-null value', async () => {
      const constant = { sightings: { id: rowNumber, tagCode: 'TAG-1', note: structuralDefault } };

      await rejects(generateRows({ sightings }, constant, { sightings: 2 }), {
        name: 'UniqueConstraintExhaustedError',
        table: 'sightings',
        columns: ['tagCode'],
      });
    });

    it('never exhausts on nulls alone, where a null-counting engine would', async () => {
      const alwaysNull = { sightings: { id: rowNumber, tagCode: null, note: structuralDefault } };
      const graph = await generateRows({ sightings }, alwaysNull, { sightings: 50 });

      eq(graph.rows.sightings.length, 50);
      ok(graph.rows.sightings.every((row) => row.tagCode === null));
    });
  });

  describe('a constraint declared NULLS NOT DISTINCT', () => {
    it('admits one null and no more', async () => {
      const alwaysNull = { strictSightings: { id: rowNumber, tagCode: null } };

      await rejects(generateRows({ strictSightings }, alwaysNull, { strictSightings: 2 }), {
        name: 'UniqueConstraintExhaustedError',
        table: 'strictSightings',
        columns: ['tagCode'],
      });
    });
  });

  describe('a composite constraint with a nullable member', () => {
    const rules = { pairs: { id: rowNumber, left: 1, right: null } };

    it('does not deduplicate tuples containing a null', async () => {
      const graph = await generateRows({ pairs }, rules, { pairs: 20 });

      eq(graph.rows.pairs.length, 20);
      ok(graph.rows.pairs.every((row) => row.left === 1 && row.right === null));
    });

    it('still deduplicates tuples with no null in them', async () => {
      const fullyPinned = { pairs: { id: rowNumber, left: 1, right: 2 } };

      await rejects(generateRows({ pairs }, fullyPinned, { pairs: 2 }), {
        name: 'UniqueConstraintExhaustedError',
        table: 'pairs',
        columns: ['left', 'right'],
      });
    });
  });
});
