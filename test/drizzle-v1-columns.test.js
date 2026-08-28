const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, match, ok } = require('node:assert');
const { defineRelations } = require('drizzle-orm');
const {
  bigint,
  bigserial,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  uuid,
  varchar,
  vector,
} = require('drizzle-orm/pg-core');
const { createInMemoryGraphSink, generate, structuralDefaults } = require('../lib');

// drizzle-orm 1.0.0 widened Column.dataType from a single token ("date") to a space-separated
// compound ("object date", "string uuid"), which the factory maps in generation-rules key on.
// This file proves structural defaults across every kind and mode which consults jsType, under
// the same swap-installed pre-release as the relations tests; it skips on the baseline install.
const available = typeof defineRelations === 'function';

const SEED = 3;

const photoShoots = pgTable('photo_shoots', {
  id: serial('id').primaryKey(),
  bigSequence: bigserial('big_sequence', { mode: 'bigint' }).notNull(),
  reference: uuid('reference').notNull(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull(),
  bornOn: date('born_on', { mode: 'date' }).notNull(),
  day: date('day').notNull(),
  price: numeric('price').notNull(),
  ratio: numeric('ratio', { mode: 'number' }).notNull(),
  total: numeric('total', { mode: 'bigint' }).notNull(),
  views: bigint('views', { mode: 'bigint' }).notNull(),
  clicks: bigint('clicks', { mode: 'number' }).notNull(),
  payload: jsonb('payload').notNull(),
});

const generateShoots = () =>
  generate(
    {
      schema: { photoShoots },
      rules: { photoShoots: { [structuralDefaults]: true } },
      counts: { photoShoots: 3 },
      seed: SEED,
    },
    createInMemoryGraphSink(),
  );

describe('structural defaults under drizzle 1.0.0 column typing', { skip: !available }, () => {
  it('gives every mode-declared column a value of its declared JavaScript type', async () => {
    const data = await generateShoots();

    eq(data.rows.photoShoots.length, 3);
    for (const row of data.rows.photoShoots) {
      match(row.reference, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      ok(row.createdAt instanceof Date, `createdAt should be a Date, got ${typeof row.createdAt}`);
      eq(typeof row.updatedAt, 'string');
      ok(row.bornOn instanceof Date, `bornOn should be a Date, got ${typeof row.bornOn}`);
      eq(typeof row.day, 'string');
      eq(typeof row.price, 'string');
      eq(typeof row.ratio, 'number');
      eq(typeof row.total, 'bigint');
      eq(typeof row.views, 'bigint');
      eq(typeof row.clicks, 'number');
      deq(row.payload, {});
    }
  });

  it('counts sequences in the declared representation', async () => {
    const data = await generateShoots();

    deq(
      data.rows.photoShoots.map((row) => row.id),
      [1, 2, 3],
    );
    deq(
      data.rows.photoShoots.map((row) => row.bigSequence),
      [1n, 2n, 3n],
    );
  });
});

// 1.0.0 also dissolved the wrapper array column: the element column itself carries a dimensions
// count (two dimensions are declared as array('[][]'), since chained array() calls do not nest),
// and a vector's declared size moved from dimensions to length.
const mood = pgEnum('mood', ['happy', 'grumpy']);

const crates = pgTable('crates', {
  id: serial('id').primaryKey(),
  counts: integer('counts').array().notNull(),
  labels: varchar('labels', { length: 8 }).array().notNull(),
  grid: varchar('grid', { length: 8 }).array('[][]').notNull(),
  moods: mood('moods').array().notNull(),
  takenAt: timestamp('taken_at').array().notNull(),
  embedding: vector('embedding', { dimensions: 3 }).notNull(),
});

const generateCrates = () =>
  generate(
    {
      schema: { crates },
      rules: { crates: { [structuralDefaults]: true } },
      counts: { crates: 3 },
      seed: SEED,
    },
    createInMemoryGraphSink(),
  );

describe('array columns under drizzle 1.0.0 column typing', { skip: !available }, () => {
  it('generates arrays of the element type, not scalars', async () => {
    const data = await generateCrates();

    for (const row of data.rows.crates) {
      ok(Array.isArray(row.counts), `counts should be an array, got ${typeof row.counts}`);
      for (const count of row.counts) eq(typeof count, 'number');
      ok(Array.isArray(row.takenAt), `takenAt should be an array, got ${typeof row.takenAt}`);
      for (const taken of row.takenAt) ok(taken instanceof Date, `element should be a Date, got ${typeof taken}`);
    }
  });

  it('keeps the element detail: varchar length and enum values', async () => {
    const data = await generateCrates();

    for (const row of data.rows.crates) {
      for (const label of row.labels) {
        eq(typeof label, 'string');
        ok(label.length <= 8, `label "${label}" should fit varchar(8)`);
      }
      for (const value of row.moods) ok(['happy', 'grumpy'].includes(value), `unexpected enum value ${value}`);
    }
  });

  it('nests a two-dimensional array declared with array("[][]")', async () => {
    const data = await generateCrates();

    for (const row of data.rows.crates) {
      ok(Array.isArray(row.grid), 'grid should be an array');
      for (const inner of row.grid) {
        ok(Array.isArray(inner), 'grid elements should themselves be arrays');
        for (const cell of inner) eq(typeof cell, 'string');
      }
    }
  });

  it('keeps a vector a vector of its declared size, never an array column', async () => {
    const data = await generateCrates();

    for (const row of data.rows.crates) {
      ok(Array.isArray(row.embedding), 'embedding should be an array of numbers');
      eq(row.embedding.length, 3);
      for (const component of row.embedding) eq(typeof component, 'number');
    }
  });
});
