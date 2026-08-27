const { describe, it } = require('node:test');
const { deepEqual: deq, match, ok, throws } = require('node:assert');
const { mkdtemp, readFile, readdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { int, mysqlTable, varchar: mysqlVarchar } = require('drizzle-orm/mysql-core');
const { integer, pgTable, varchar } = require('drizzle-orm/pg-core');
const {
  createCsvFileSink,
  createMariaDbSqlFileSink,
  createPostgresSqlFileSink,
  derive,
  generate,
  structuralDefault,
} = require('../lib');

const SEED = 4;

const parks = pgTable('parks', {
  id: integer('id').primaryKey(),
  name: varchar('name', { length: 20 }).notNull(),
});

const readings = mysqlTable('readings', {
  id: int('id').primaryKey(),
  label: mysqlVarchar('label', { length: 20 }).notNull(),
});

const rowNumber = derive((_row, context) => context.rowIndex + 1);
const parkRules = { parks: { id: rowNumber, name: structuralDefault } };

const temporaryDirectory = () => mkdtemp(join(tmpdir(), 'drizzle-super-seed-'));

const generateParks = async (options) => {
  const directory = await temporaryDirectory();
  await generate(
    { schema: { parks }, rules: parkRules, counts: { parks: 2 }, seed: SEED },
    createPostgresSqlFileSink({ directory, ...options }),
  );
  return directory;
};

describe('output file prefix', () => {
  it('prefixes every file so the set sorts after any digit-prefixed migration', async () => {
    const directory = await generateParks();

    deq((await readdir(directory)).sort(), [
      'load.psql',
      'manifest.json',
      'seed-0000_set_unlogged.sql',
      'seed-0010_parks.sql',
      'seed-9990_finalise.sql',
    ]);
    await rm(directory, { recursive: true, force: true });
  });

  it('sorts after four-digit migration names, which five-digit numbers alone did not', async () => {
    const directory = await generateParks();
    const names = [...(await readdir(directory)).filter((file) => file.startsWith('seed-')), '2000_late_migration.sql'];

    // The bug this prefix fixes: seed-0010_parks.sql sorted before 2000_late_migration.sql, so
    // generated data loaded before the tail of the migration history created its tables.
    deq(names.sort()[0], '2000_late_migration.sql');
    await rm(directory, { recursive: true, force: true });
  });

  it('names the prefixed files in the orchestrator and the manifest', async () => {
    const directory = await generateParks();

    match(await readFile(join(directory, 'load.psql'), 'utf8'), /\\ir seed-0010_parks\.sql/);
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
    deq(manifest.files, ['seed-0000_set_unlogged.sql', 'seed-0010_parks.sql', 'seed-9990_finalise.sql']);
    await rm(directory, { recursive: true, force: true });
  });

  it('takes any prefix the caller prefers', async () => {
    const directory = await generateParks({ filePrefix: 'fixtures_' });

    ok((await readdir(directory)).includes('fixtures_0010_parks.sql'));
    match(await readFile(join(directory, 'load.psql'), 'utf8'), /\\ir fixtures_0010_parks\.sql/);
    await rm(directory, { recursive: true, force: true });
  });

  it('accepts an empty prefix, for a directory holding nothing else', async () => {
    const directory = await generateParks({ filePrefix: '' });

    ok((await readdir(directory)).includes('0010_parks.sql'));
    await rm(directory, { recursive: true, force: true });
  });

  it('refuses a prefix which would write outside the directory', async () => {
    const refusal = {
      name: 'InvalidFilePrefixError',
      prefix: '../escape-',
      message:
        'The file prefix ../escape- contains a path separator, which would write outside the ' +
        'output directory. Give a prefix of ordinary file name characters.',
    };

    throws(() => createPostgresSqlFileSink({ directory: '/tmp/never', filePrefix: '../escape-' }), refusal);
    throws(() => createMariaDbSqlFileSink({ directory: '/tmp/never', filePrefix: '../escape-' }), refusal);
    throws(() => createCsvFileSink({ directory: '/tmp/never', filePrefix: '../escape-' }), refusal);
  });

  it('prefixes the mariadb and csv sinks the same way', async () => {
    const mariaDirectory = await temporaryDirectory();
    await generate(
      {
        schema: { readings },
        rules: { readings: { id: rowNumber, label: structuralDefault } },
        counts: { readings: 2 },
        seed: SEED,
      },
      createMariaDbSqlFileSink({ directory: mariaDirectory }),
    );
    deq((await readdir(mariaDirectory)).sort(), [
      'load.mysql',
      'manifest.json',
      'seed-0010_readings.sql',
      'seed-9990_finalise.sql',
    ]);

    const csvDirectory = await temporaryDirectory();
    await generate(
      { schema: { parks }, rules: parkRules, counts: { parks: 2 }, seed: SEED },
      createCsvFileSink({ directory: csvDirectory }),
    );
    deq((await readdir(csvDirectory)).sort(), ['manifest.json', 'seed-0010_parks.csv']);

    await rm(mariaDirectory, { recursive: true, force: true });
    await rm(csvDirectory, { recursive: true, force: true });
  });
});
