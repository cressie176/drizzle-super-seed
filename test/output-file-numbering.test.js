const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, ok, rejects } = require('node:assert');
const { mkdtemp, readdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { int, mysqlTable } = require('drizzle-orm/mysql-core');
const { integer, pgTable } = require('drizzle-orm/pg-core');
const { createMariaDbSqlFileSink } = require('../lib/mariadb/mariadb-sql-file-sink');
const { createPostgresSqlFileSink, generate, structuralDefault } = require('../lib');

const SEED = 42;
const LIMIT = 8998;

// One column each, so a schema of ninety of them is cheap to build and generate.
const manyTables = (count) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `table${String(index).padStart(4, '0')}`,
      pgTable(`table_${index}`, { id: integer('id').primaryKey() }),
    ]),
  );

const rulesFor = (schema) =>
  Object.fromEntries(Object.keys(schema).map((tableKey) => [tableKey, { id: structuralDefault }]));

const countsFor = (schema) => Object.fromEntries(Object.keys(schema).map((tableKey) => [tableKey, 1]));

const generateInto = (directory, schema) =>
  generate(
    { schema, rules: rulesFor(schema), counts: countsFor(schema), seed: SEED },
    createPostgresSqlFileSink({ directory }),
  );

const temporaryDirectory = () => mkdtemp(join(tmpdir(), 'drizzle-super-seed-'));

describe('numbered output files', () => {
  it('numbers up to the last slot below the finalise file', async () => {
    const directory = await temporaryDirectory();
    const schema = manyTables(LIMIT);
    await generateInto(directory, schema);
    const numbered = (await readdir(directory)).filter((file) => /^\d{5}_/.test(file)).sort();

    eq(numbered.length, LIMIT + 2);
    ok(numbered.includes('10000_set_unlogged.sql'));
    ok(numbered.includes('99980_table8997.sql'));
    ok(numbered.includes('99990_finalise.sql'));
    await rm(directory, { recursive: true, force: true });
  });

  it('refuses the file which would collide with the finalise file', async () => {
    const directory = await temporaryDirectory();

    await rejects(generateInto(directory, manyTables(LIMIT + 1)), {
      name: 'TooManyOutputFilesError',
      message:
        'Generating table8998 would need more than 8998 numbered files, and the numbering would then ' +
        'collide with the finalise file and load out of order. ' +
        'Generate fewer tables per run, into a directory each.',
      limit: LIMIT,
      table: 'table8998',
    });

    // The refusal comes before the file is opened, so nothing beyond the 8998 already written lands.
    const numbered = (await readdir(directory)).filter((file) => /^\d{5}_/.test(file));
    eq(numbered.length, LIMIT);
    await rm(directory, { recursive: true, force: true });
  });

  it('guards the mariadb sink by the same arithmetic', async () => {
    const directory = await temporaryDirectory();
    const schema = Object.fromEntries(
      Array.from({ length: LIMIT + 1 }, (_, index) => [
        `table${String(index).padStart(4, '0')}`,
        mysqlTable(`table_${index}`, { id: int('id').primaryKey() }),
      ]),
    );

    await rejects(
      generate(
        { schema, rules: rulesFor(schema), counts: countsFor(schema), seed: SEED },
        createMariaDbSqlFileSink({ directory }),
      ),
      { name: 'TooManyOutputFilesError', limit: LIMIT },
    );

    await rm(directory, { recursive: true, force: true });
  });

  it('counts deferred files against the same limit, because they share the sequence', async () => {
    const directory = await temporaryDirectory();
    const schema = manyTables(LIMIT);
    // The 8998 table files fill the sequence, so a deferred file has nowhere to go, which is the
    // case a limit counted in tables would overlook.
    await generateInto(directory, schema);
    const numbered = (await readdir(directory)).filter((file) => /^\d{5}_/.test(file) && file !== '99990_finalise.sql');

    deq(numbered.length, LIMIT + 1);
    await rm(directory, { recursive: true, force: true });
  });
});
