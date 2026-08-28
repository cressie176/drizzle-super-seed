// The stream sink example: one psql script streamed straight into a spawned psql process, no
// intermediate files. The sink holds no table in memory and the script is never assembled
// whole, which is its reason to exist next to the file sink. Needs the repository's compose
// PostgreSQL (npm run db:up at the root).
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { type GenerationReport, createPostgresSqlStreamSink, generate } from 'drizzle-super-seed';
import { productionCounts } from '../src/counts.ts';
import { SEED, seedFaker } from '../src/generators.ts';
import { generateMigrations, migrationStatements } from '../src/migrations.ts';
import { rules } from '../src/rules.ts';
import * as schema from '../src/schema.ts';

const run = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(here, '..', '..', '..');
const DATABASE = 'park_stream_example';

const psqlValue = async (statement: string) =>
  (
    await run(
      'docker',
      [
        'compose',
        'exec',
        '-T',
        'postgres',
        'psql',
        '-t',
        '-A',
        '-U',
        'drizzle_super_seed',
        '-d',
        DATABASE,
        '-c',
        statement,
      ],
      { cwd: repositoryRoot },
    )
  ).stdout
    .trim()
    .split('\n')[0];

const administer = (statement: string) =>
  run(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'drizzle_super_seed',
      '-d',
      'drizzle_super_seed',
      '-c',
      statement,
    ],
    { cwd: repositoryRoot },
  );

// The README's spawn pattern: psql reads the script from stdin as the sink writes it.
const spawnedPsql = () => {
  const child = spawn(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
      '-U',
      'drizzle_super_seed',
      '-d',
      DATABASE,
    ],
    { cwd: repositoryRoot, stdio: ['pipe', 'ignore', 'inherit'] },
  );
  const finished = new Promise<void>((resolve, reject) => {
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`psql exited ${code}`))));
  });
  return { stdin: child.stdin, finished };
};

let report: GenerationReport;

before(async () => {
  seedFaker(SEED);
  await administer(`DROP DATABASE IF EXISTS ${DATABASE}`);
  await administer(`CREATE DATABASE ${DATABASE}`);

  const migrations = await generateMigrations();
  for (const statement of await migrationStatements(migrations)) {
    await run(
      'docker',
      [
        'compose',
        'exec',
        '-T',
        'postgres',
        'psql',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'drizzle_super_seed',
        '-d',
        DATABASE,
        '-c',
        statement,
      ],
      { cwd: repositoryRoot },
    );
  }

  const { stdin, finished } = spawnedPsql();
  report = await generate(
    { schema, rules, counts: productionCounts, seed: SEED },
    createPostgresSqlStreamSink({ writable: stdin }),
  );
  stdin.end();
  await finished;
});

test('the streamed load holds every row the report counted', async () => {
  assert.equal(await psqlValue('SELECT COUNT(*) FROM parks'), String(report.rowCounts.parks));
  assert.equal(await psqlValue('SELECT COUNT(*) FROM lettings'), String(report.rowCounts.lettings));
  assert.ok(Number(report.rowCounts.lettings) > 10_000, 'a production sized dataset streamed through');
});

test('foreign keys join across the streamed tables', async () => {
  const orphans = await psqlValue(`
    SELECT (SELECT COUNT(*) FROM lettings l LEFT JOIN holiday_homes h ON h.id = l.holiday_home_id WHERE h.id IS NULL)
         + (SELECT COUNT(*) FROM holiday_homes h LEFT JOIN pitches p ON p.id = h.pitch_id WHERE p.id IS NULL)
         + (SELECT COUNT(*) FROM pitches p LEFT JOIN parks k ON k.id = p.park_id WHERE k.id IS NULL)
  `);
  assert.equal(orphans, '0');
});

test('the prepare-driven preamble made the tables unlogged before any data arrived', async () => {
  assert.equal(await psqlValue("SELECT relpersistence FROM pg_class WHERE relname = 'lettings'"), 'u');
  assert.equal(await psqlValue("SELECT relpersistence FROM pg_class WHERE relname = 'parks'"), 'u');
});

test('the sequences are ready for the next insert', async () => {
  const next = await psqlValue(
    "INSERT INTO parks (name, region, opened_at, active) VALUES ('New Park', 'wales', '2024-01-01', true) RETURNING id",
  );
  assert.equal(next, '21');
});
