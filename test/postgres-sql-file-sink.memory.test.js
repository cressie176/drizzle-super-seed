const { describe, it, before, after } = require('node:test');
const { equal: eq, ok } = require('node:assert');
const { mkdtemp, rm, stat } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { integer, pgTable, serial, varchar } = require('drizzle-orm/pg-core');
const { createPostgresSqlFileSink, generate, structuralDefault } = require('../lib');

const SEED = 42;
const REFERENCE_DATE = new Date('2024-06-01T00:00:00.000Z');
const ROWS = 1_000_000;
const HEAP_CEILING = 512 * 1024 * 1024;
const MEGABYTE = 1024 * 1024;

// Nothing references this table, so the engine retains none of its values and the only thing
// that could grow with the row count is the sink's own buffering.
const readings = pgTable('readings', {
  id: serial('id').primaryKey(),
  value: integer('value').notNull(),
  label: varchar('label', { length: 12 }).notNull(),
});

const readingRules = {
  readings: { id: structuralDefault, value: structuralDefault, label: structuralDefault },
};

// The generation loop is a chain of microtasks, which starves timers, so the heap is sampled
// from the sink itself: once per batch, a thousand times over the run.
const samplingSink = (sink, samples) => ({
  beginTable: (table) => sink.beginTable(table),
  writeRows: (table, rows) => {
    samples.push(process.memoryUsage().heapUsed);
    return sink.writeRows(table, rows);
  },
  endTable: (table) => sink.endTable(table),
  end: (report) => sink.end(report),
});

describe('postgres sql file sink', () => {
  let directory;
  let report;
  let samples;

  before(async () => {
    directory = await mkdtemp(join(tmpdir(), 'drizzle-super-seed-'));
    samples = [];
    report = await generate(
      {
        schema: { readings },
        rules: readingRules,
        counts: { readings: ROWS },
        seed: SEED,
        referenceDate: REFERENCE_DATE,
      },
      samplingSink(createPostgresSqlFileSink({ directory }), samples),
    );
  });

  after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  describe('at a million rows', () => {
    it('generates every row', () => {
      eq(report.rowCounts.readings, ROWS);
      eq(samples.length, ROWS / 1000);
    });

    it('writes them all to the file', async () => {
      const { size } = await stat(join(directory, 'seed-00010_readings.sql'));

      ok(size > 10 * MEGABYTE, `expected a substantial file, got ${size} bytes`);
    });

    it('holds the heap under the ceiling throughout', () => {
      const peak = Math.max(...samples);

      ok(peak < HEAP_CEILING, `peaked at ${Math.round(peak / MEGABYTE)} MB`);
    });

    it('does not grow the heap in step with the rows', () => {
      const early = samples.slice(0, 100);
      const late = samples.slice(-100);
      const averageOf = (values) => values.reduce((total, each) => total + each, 0) / values.length;

      ok(
        averageOf(late) < averageOf(early) + 100 * MEGABYTE,
        `grew from ${Math.round(averageOf(early) / MEGABYTE)} MB to ${Math.round(averageOf(late) / MEGABYTE)} MB`,
      );
    });
  });
});
