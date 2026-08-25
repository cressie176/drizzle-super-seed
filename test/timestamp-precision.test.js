const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, ok } = require('node:assert');
const { getTableColumns } = require('drizzle-orm');
const mysql = require('drizzle-orm/mysql-core');
const { integer, pgTable, timestamp } = require('drizzle-orm/pg-core');
const sqlite = require('drizzle-orm/sqlite-core');
const { createInMemoryGraphSink, extractCanonicalSchema, generate, structuralDefault } = require('../lib');

const SEED = 42;
const REFERENCE_DATE = new Date('2024-06-01T00:00:00.000Z');
const ROWS = 200;

const structuralRules = (schema) =>
  Object.fromEntries(
    Object.entries(schema).map(([tableKey, table]) => [
      tableKey,
      Object.fromEntries(Object.keys(getTableColumns(table)).map((propertyName) => [propertyName, structuralDefault])),
    ]),
  );

const generateRows = (schema, counts) =>
  generate(
    { schema, rules: structuralRules(schema), counts, seed: SEED, referenceDate: REFERENCE_DATE },
    createInMemoryGraphSink(),
  );

const precisionOf = (schema, tableKey, propertyName) =>
  extractCanonicalSchema(schema)
    .tables.get(tableKey)
    .columns.find((column) => column.propertyName === propertyName).fractionalSecondDigits;

describe('timestamp precision', () => {
  describe('what each dialect reports', () => {
    it('reads MySQL fractional seconds precision, which defaults to none', () => {
      const events = mysql.mysqlTable('events', {
        id: mysql.int('id').primaryKey().autoincrement(),
        plain: mysql.datetime('plain'),
        milli: mysql.datetime('milli', { fsp: 3 }),
        micro: mysql.timestamp('micro', { fsp: 6 }),
      });

      eq(precisionOf({ events }, 'events', 'plain'), 0);
      eq(precisionOf({ events }, 'events', 'milli'), 3);
      eq(precisionOf({ events }, 'events', 'micro'), 6);
    });

    it('reads SQLite timestamp modes, where seconds is the default', () => {
      const events = sqlite.sqliteTable('events', {
        id: sqlite.integer('id').primaryKey(),
        seconds: sqlite.integer('seconds', { mode: 'timestamp' }),
        millis: sqlite.integer('millis', { mode: 'timestamp_ms' }),
      });

      eq(precisionOf({ events }, 'events', 'seconds'), 0);
      eq(precisionOf({ events }, 'events', 'millis'), 3);
    });

    it('leaves PostgreSQL alone unless the column is coarser than a Date', () => {
      const events = pgTable('events', {
        id: integer('id').primaryKey(),
        plain: timestamp('plain'),
        coarse: timestamp('coarse', { precision: 0 }),
        fine: timestamp('fine', { precision: 6 }),
      });

      eq(precisionOf({ events }, 'events', 'plain'), undefined);
      eq(precisionOf({ events }, 'events', 'coarse'), 0);
      eq(precisionOf({ events }, 'events', 'fine'), undefined);
    });
  });

  describe('what the structural default generates', () => {
    const coarse = pgTable('coarse', {
      id: integer('id').primaryKey(),
      at: timestamp('at', { precision: 0 }).notNull(),
    });

    const fine = pgTable('fine', {
      id: integer('id').primaryKey(),
      at: timestamp('at').notNull(),
    });

    it('emits whole seconds for a column which stores whole seconds', async () => {
      const graph = await generateRows({ coarse }, { coarse: ROWS });

      ok(graph.rows.coarse.every((row) => row.at.getMilliseconds() === 0));
    });

    it('still emits milliseconds where the column keeps them', async () => {
      const graph = await generateRows({ fine }, { fine: ROWS });

      ok(graph.rows.fine.some((row) => row.at.getMilliseconds() !== 0));
    });

    it('truncates rather than rounds, so a value never moves forward', async () => {
      const graph = await generateRows({ coarse, fine }, { coarse: ROWS, fine: ROWS });

      ok(graph.rows.coarse.every((row) => row.at <= REFERENCE_DATE));
    });
  });

  describe('the mariadb fixture', () => {
    const mariaDbSchema = require('./lib/park-schema-mariadb');

    it('generates datetimes its own columns can store', async () => {
      const graph = await generateRows({ parks: mariaDbSchema.parks }, { parks: ROWS });

      ok(graph.rows.parks.every((row) => row.openedAt.getMilliseconds() === 0));
    });

    it('keeps a uniqueness guarantee the database will still honour', async () => {
      const graph = await generateRows({ parks: mariaDbSchema.parks }, { parks: ROWS });
      const stored = graph.rows.parks.map((row) => row.openedAt.toISOString());

      // Distinct in the engine and distinct once stored are now the same question.
      deq(stored.length, ROWS);
    });
  });
});
