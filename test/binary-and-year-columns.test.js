const { describe, it } = require('node:test');
const { equal: eq, ok, rejects } = require('node:assert');
const { binary, int, mysqlTable, varbinary, year } = require('drizzle-orm/mysql-core');
const { blob, integer: sqliteInteger, sqliteTable } = require('drizzle-orm/sqlite-core');
const { createRecordingSink, rowsOf } = require('./lib/recording-sink');
const { generate, structuralDefault } = require('../lib');

const SEED = 7;

const YEAR_MIN = 1_901;
const YEAR_MAX = 2_155;

const generateOne = (schema, rules) =>
  generate({ schema, rules, counts: { things: 1 }, seed: SEED }, createRecordingSink());

describe('binary columns', () => {
  const rejectsBinary = (schema) =>
    rejects(generateOne(schema, { things: { id: structuralDefault, payload: structuralDefault } }), {
      name: 'UnsupportedColumnTypeError',
      table: 'things',
      column: 'payload',
    });

  it('refuses a mysql binary column rather than filling it with words', async () => {
    const things = mysqlTable('things', {
      id: int('id').primaryKey(),
      payload: binary('payload', { length: 16 }),
    });
    await rejectsBinary({ things });
  });

  it('refuses a mysql varbinary column', async () => {
    const things = mysqlTable('things', {
      id: int('id').primaryKey(),
      payload: varbinary('payload', { length: 16 }),
    });
    await rejectsBinary({ things });
  });

  it('refuses a sqlite blob column', async () => {
    const things = sqliteTable('things', {
      id: sqliteInteger('id').primaryKey(),
      payload: blob('payload'),
    });
    await rejectsBinary({ things });
  });

  it('names the drizzle column type it could not map', async () => {
    const things = mysqlTable('things', {
      id: int('id').primaryKey(),
      payload: binary('payload', { length: 16 }),
    });

    await rejects(generateOne({ things }, { things: { id: structuralDefault, payload: structuralDefault } }), {
      message: /MySqlBinary/,
    });
  });
});

describe('year columns', () => {
  const things = mysqlTable('things', {
    id: int('id').primaryKey(),
    built: year('built'),
  });

  const generateYears = (count) =>
    generate(
      {
        schema: { things },
        rules: { things: { id: structuralDefault, built: structuralDefault } },
        counts: { things: count },
        seed: SEED,
      },
      createRecordingSink(),
    );

  it('generates only years the server will accept', async () => {
    const result = await generateYears(500);
    const years = rowsOf(result, 'things')
      .map((row) => row.built)
      .filter((value) => value !== null);

    ok(years.length > 0);
    eq(
      years.every((value) => value >= YEAR_MIN && value <= YEAR_MAX),
      true,
      `outside YEAR's range: ${years.filter((value) => value < YEAR_MIN || value > YEAR_MAX)}`,
    );
  });

  it('spans the range rather than clustering at its floor', async () => {
    const result = await generateYears(500);
    const years = rowsOf(result, 'things')
      .map((row) => row.built)
      .filter((value) => value !== null);

    ok(Math.max(...years) > 2_100, 'never reaches the top of the range');
    ok(Math.min(...years) < 1_950, 'never reaches the bottom of the range');
  });
});
