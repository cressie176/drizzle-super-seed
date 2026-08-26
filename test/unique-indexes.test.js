const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, rejects } = require('node:assert');
const { sql } = require('drizzle-orm');
const { int, mysqlTable, uniqueIndex: mysqlUniqueIndex } = require('drizzle-orm/mysql-core');
const { index, integer, pgTable, text, uniqueIndex } = require('drizzle-orm/pg-core');
const { integer: sqliteInteger, sqliteTable, uniqueIndex: sqliteUniqueIndex } = require('drizzle-orm/sqlite-core');
const { createRecordingSink } = require('./lib/recording-sink');
const { derive, extractCanonicalSchema, generate, randomInteger, structuralDefault } = require('../lib');

const SEED = 27;

describe('unique indexes in the adapter', () => {
  it('tracks a plain unique index as a unique constraint', () => {
    const slots = pgTable(
      'slots',
      { id: integer('id').primaryKey(), bay: integer('bay').notNull(), row: integer('row').notNull() },
      (table) => [uniqueIndex('slots_bay_row').on(table.bay, table.row)],
    );

    deq(extractCanonicalSchema({ slots }).tables.get('slots').uniqueConstraints, [
      { columns: ['bay', 'row'], nullsNotDistinct: false },
    ]);
  });

  it('skips partial and expression indexes, and plain non-unique ones', () => {
    const slots = pgTable('slots', { id: integer('id').primaryKey(), label: text('label') }, (table) => [
      uniqueIndex('slots_partial').on(table.label).where(sql`label IS NOT NULL`),
      uniqueIndex('slots_expr').on(sql`lower(label)`),
      index('slots_plain').on(table.label),
    ]);

    deq(extractCanonicalSchema({ slots }).tables.get('slots').uniqueConstraints, []);
  });

  it('tracks mysql and sqlite unique indexes the same way', () => {
    const places = mysqlTable('places', { id: int('id').primaryKey(), code: int('code').notNull() }, (table) => [
      mysqlUniqueIndex('places_code').on(table.code),
    ]);
    const rooms = sqliteTable(
      'rooms',
      { id: sqliteInteger('id').primaryKey(), floor: sqliteInteger('floor').notNull() },
      (table) => [sqliteUniqueIndex('rooms_floor').on(table.floor)],
    );

    deq(extractCanonicalSchema({ places }).tables.get('places').uniqueConstraints, [
      { columns: ['code'], nullsNotDistinct: false },
    ]);
    deq(extractCanonicalSchema({ rooms }).tables.get('rooms').uniqueConstraints, [
      { columns: ['floor'], nullsNotDistinct: false },
    ]);
  });
});

describe('unique indexes in the engine', () => {
  const slots = pgTable('slots', { id: integer('id').primaryKey(), bay: integer('bay').notNull() }, (table) => [
    uniqueIndex('slots_bay').on(table.bay),
  ]);

  it('keeps structurally generated values within the index, retrying collisions', async () => {
    const result = await generate(
      {
        schema: { slots },
        rules: { slots: { id: derive((_row, context) => context.rowIndex + 1), bay: randomInteger(1, 40) } },
        counts: { slots: 40 },
        seed: SEED,
      },
      createRecordingSink(),
    );

    const bays = result.rowsByTable.get('slots').map((row) => row.bay);
    eq(new Set(bays).size, 40);
  });

  it('exhausts loudly when the index leaves no room, naming the columns', async () => {
    await rejects(
      generate(
        {
          schema: { slots },
          rules: { slots: { id: derive((_row, context) => context.rowIndex + 1), bay: randomInteger(1, 5) } },
          counts: { slots: 40 },
          seed: SEED,
        },
        createRecordingSink(),
      ),
      { name: 'UniqueConstraintExhaustedError', table: 'slots', columns: ['bay'] },
    );
  });
});
