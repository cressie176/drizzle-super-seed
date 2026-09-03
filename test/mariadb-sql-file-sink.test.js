const { describe, it, before, after } = require('node:test');
const { deepEqual: deq, equal: eq, match, ok, rejects } = require('node:assert');
const { mkdtemp, readFile, readdir, rm, stat, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { getTableColumns } = require('drizzle-orm');
const { bigint, int, mysqlTable, varchar } = require('drizzle-orm/mysql-core');
const { generate, structuralDefault } = require('../lib');
const { createMariaDbSqlFileSink } = require('../lib/mariadb/mariadb-sql-file-sink');
const mariaDbSchema = require('./lib/park-schema-mariadb');
const { sha256Sum } = require('./lib/sha256-sum');

const SEED = 42;
const REFERENCE_DATE = new Date('2024-06-01T00:00:00.000Z');
const MEGABYTE = 1024 * 1024;
const HEAP_CEILING = 512 * MEGABYTE;

const COUNTS = { parks: 2, owners: 4, pitches: 3, holidayHomes: 3, accessories: 2, lettings: 3, parkOwners: 2 };

const NUMBERED = [
  'seed-0010_parks.sql',
  'seed-0020_pitches.sql',
  'seed-0030_owners.sql',
  'seed-0040_holidayHomes.sql',
  'seed-0050_accessories.sql',
  'seed-0060_lettings.sql',
  'seed-0070_parkOwners.sql',
];

const structuralRules = (schema) =>
  Object.fromEntries(
    Object.entries(schema).map(([tableKey, table]) => [
      tableKey,
      Object.fromEntries(Object.keys(getTableColumns(table)).map((propertyName) => [propertyName, structuralDefault])),
    ]),
  );

const temporaryDirectory = () => mkdtemp(join(tmpdir(), 'drizzle-super-seed-'));

const generateInto = (directory, overrides = {}) =>
  generate(
    {
      schema: mariaDbSchema,
      rules: structuralRules(mariaDbSchema),
      counts: COUNTS,
      seed: SEED,
      referenceDate: REFERENCE_DATE,
      ...overrides,
    },
    createMariaDbSqlFileSink({ directory, rowsPerStatement: overrides.rowsPerStatement }),
  );

const read = (directory, file) => readFile(join(directory, file), 'utf8');

describe('mariadb sql file sink', () => {
  let directory;

  before(async () => {
    directory = await temporaryDirectory();
    await generateInto(directory);
  });

  after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  describe('the files it writes', () => {
    it('writes one numbered file per table, a finalise file, an orchestrator and a manifest', async () => {
      deq((await readdir(directory)).sort(), ['load.mysql', 'manifest.json', ...NUMBERED, 'seed-9990_finalise.sql']);
    });

    it('numbers the files so lexical order is dependency order', async () => {
      deq(
        (await readdir(directory))
          .filter((file) => /^seed-\d{4}_/.test(file) && file !== 'seed-9990_finalise.sql')
          .sort(),
        NUMBERED,
      );
    });

    it('makes each table file self contained', async () => {
      const parks = await read(directory, 'seed-0010_parks.sql');

      ok(parks.startsWith('START TRANSACTION;\nSET foreign_key_checks = 0;\nSET unique_checks = 0;\n'));
      ok(parks.includes('INSERT INTO `parks` (`id`, `name`'));
      ok(parks.endsWith(';\nCOMMIT;\n'));
    });

    it('needs no trigger handling option, because it needs no privilege', () => {
      eq(createMariaDbSqlFileSink({ directory }).dialect, 'MariaDb');
    });

    it('writes an empty transaction for a table counted at zero', async () => {
      const empty = await temporaryDirectory();
      await generateInto(empty, { counts: { parks: 0 } });

      eq(await read(empty, 'seed-0010_parks.sql'), 'START TRANSACTION;\nCOMMIT;\n');
      await rm(empty, { recursive: true, force: true });
    });
  });

  describe('extended inserts', () => {
    it('chunks the rows into statements of its own size, whatever the batch size', async () => {
      const chunked = await temporaryDirectory();
      await generateInto(chunked, { counts: { parks: 5 }, batchSize: 2, rowsPerStatement: 2 });
      const parks = await read(chunked, 'seed-0010_parks.sql');

      eq(parks.split('INSERT INTO').length - 1, 3);
      eq(parks.split('),\n').length - 1, 2);
      await rm(chunked, { recursive: true, force: true });
    });

    it('writes a single statement when the rows fit in one', async () => {
      const single = await temporaryDirectory();
      await generateInto(single, { counts: { parks: 5 }, batchSize: 2, rowsPerStatement: 1000 });

      eq((await read(single, 'seed-0010_parks.sql')).split('INSERT INTO').length - 1, 1);
      await rm(single, { recursive: true, force: true });
    });
  });

  describe('the orchestrator', () => {
    it('sources every numbered file once, in order', async () => {
      eq(
        await read(directory, 'load.mysql'),
        `${[...NUMBERED, 'seed-9990_finalise.sql'].map((file) => `source ${file};`).join('\n')}\n`,
      );
    });

    it('carries the mysql extension, so the docker glob does not run it twice', async () => {
      const entries = await readdir(directory);

      ok(entries.includes('load.mysql'));
      ok(!entries.includes('load.sql'));
    });
  });

  describe('the finalise file', () => {
    it('analyses every table it generated, and fixes up no sequence', async () => {
      const finalise = await read(directory, 'seed-9990_finalise.sql');

      eq(finalise.split('ANALYZE TABLE').length - 1, Object.keys(COUNTS).length);
      ok(finalise.includes('ANALYZE TABLE `holiday_homes`;'));
      ok(!finalise.includes('AUTO_INCREMENT'));
    });
  });

  describe('the manifest', () => {
    it('records the seed, the reference date, the counts and the statement size', async () => {
      const manifest = JSON.parse(await read(directory, 'manifest.json'));

      eq(manifest.seed, SEED);
      eq(manifest.referenceDate, REFERENCE_DATE.toISOString());
      deq(manifest.rowCounts, COUNTS);
      eq(manifest.rowsPerStatement, 1000);
    });

    it('records a content hash over the payload files it lists', async () => {
      const manifest = JSON.parse(await read(directory, 'manifest.json'));

      match(manifest.contentHash, /^sha256:[0-9a-f]{64}$/);
      eq(manifest.contentHash, await sha256Sum(directory, manifest.files));
    });

    it('records nothing which varies between runs of the same inputs', async () => {
      const manifest = JSON.parse(await read(directory, 'manifest.json'));

      eq(manifest.generatedAt, undefined);
      eq(manifest.durationMs, undefined);
    });
  });

  describe('the output directory', () => {
    it('refuses to write into a directory which already holds something', async () => {
      const occupied = await temporaryDirectory();
      await writeFile(join(occupied, 'stale.sql'), 'SELECT 1;\n');

      await rejects(generateInto(occupied, { counts: { parks: 1 } }), { name: 'OutputDirectoryNotEmptyError' });

      deq(await readdir(occupied), ['stale.sql']);
      await rm(occupied, { recursive: true, force: true });
    });
  });

  describe('reproducibility', () => {
    it('writes byte identical files for the same seed and reference date, the manifest included', async () => {
      const again = await temporaryDirectory();
      await generateInto(again);
      const files = (await readdir(directory)).sort();

      deq((await readdir(again)).sort(), files);
      for (const file of files) eq(await read(again, file), await read(directory, file), `${file} differs`);
      await rm(again, { recursive: true, force: true });
    });
  });

  describe('at a million rows', () => {
    const readings = mysqlTable('readings', {
      id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
      value: int('value').notNull(),
      label: varchar('label', { length: 12 }).notNull(),
    });

    it('holds the heap under the ceiling and writes them all', async () => {
      const large = await temporaryDirectory();
      const samples = [];
      const sink = createMariaDbSqlFileSink({ directory: large });
      const report = await generate(
        {
          schema: { readings },
          rules: structuralRules({ readings }),
          counts: { readings: 1_000_000 },
          seed: SEED,
          referenceDate: REFERENCE_DATE,
        },
        {
          beginTable: (table) => sink.beginTable(table),
          writeRows: (table, rows) => {
            samples.push(process.memoryUsage().heapUsed);
            return sink.writeRows(table, rows);
          },
          endTable: (table) => sink.endTable(table),
          end: (finished) => sink.end(finished),
        },
      );
      const { size } = await stat(join(large, 'seed-0010_readings.sql'));

      eq(report.rowCounts.readings, 1_000_000);
      ok(size > 10 * MEGABYTE);
      ok(Math.max(...samples) < HEAP_CEILING, `peaked at ${Math.round(Math.max(...samples) / MEGABYTE)} MB`);
      await rm(large, { recursive: true, force: true });
    });
  });
});
