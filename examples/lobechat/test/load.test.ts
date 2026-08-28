// LobeChat end to end: fetch the schema, generate COPY files, and load them into a real PostgreSQL
// with pgvector, behind the DDL drizzle-kit emits for the same schema. The compose PostgreSQL has
// no pgvector, so this runs its own container the way the library's own vector test does.
//
// A successful load is the assertion that matters most: the DDL carries every foreign key the
// schema declares, composite ones included, so data that violated one would not get in.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { ROWS_PER_TABLE } from '../src/counts.ts';

const run = promisify(execFile);

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const CONTAINER = 'drizzle-super-seed-lobechat';
const IMAGE = 'pgvector/pgvector:pg17';
const READY_ATTEMPTS = 60;
const TABLE_COUNT = 165;

const psql = (statement: string) =>
  run('docker', ['exec', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-t', '-A', '-c', statement]);

const psqlScript = (script: string) =>
  new Promise<string>((resolve, reject) => {
    const child = execFile(
      'docker',
      ['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'],
      { maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => (error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(stdout)),
    );
    child.stdin?.end(script);
  });

const waitUntilReady = async (): Promise<void> => {
  for (let attempt = 0; attempt < READY_ATTEMPTS; attempt++) {
    try {
      await psql('SELECT 1');
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error('pgvector never became ready');
};

const value = async (statement: string): Promise<string> => (await psql(statement)).stdout.trim();

describe('LobeChat through a real PostgreSQL', { skip: process.env.SKIP_PGVECTOR === 'true' }, () => {
  before(async () => {
    await run('npx', ['tsx', 'scripts/fetch-schema.ts'], { cwd: packageRoot, maxBuffer: 32 * 1024 * 1024 });
    await run('npx', ['drizzle-kit', 'generate'], { cwd: packageRoot, maxBuffer: 32 * 1024 * 1024 });
    await run('npx', ['tsx', 'scripts/generate.ts'], { cwd: packageRoot, maxBuffer: 32 * 1024 * 1024 });

    await run('docker', ['rm', '-f', CONTAINER]).catch(() => {});
    await run('docker', ['run', '-d', '--name', CONTAINER, '-e', 'POSTGRES_PASSWORD=lobechat', IMAGE], {
      maxBuffer: 32 * 1024 * 1024,
    });
    await waitUntilReady();

    const migrations = join(packageRoot, 'drizzle');
    const ddlFiles = (await readdir(migrations)).filter((file) => file.endsWith('.sql')).sort();
    const ddl = await Promise.all(ddlFiles.map((file) => readFile(join(migrations, file), 'utf8')));
    await psqlScript(['CREATE EXTENSION IF NOT EXISTS vector;', ...ddl].join('\n'));

    // One invocation rather than one per file: the numbered files are already in dependency order,
    // and concatenating them keeps a 165 table load to a single round trip.
    const data = join(packageRoot, 'out');
    const dataFiles = (await readdir(data)).filter((file) => file.endsWith('.sql')).sort();
    const scripts = await Promise.all(dataFiles.map((file) => readFile(join(data, file), 'utf8')));
    await psqlScript(scripts.join('\n'));
  });

  after(async () => {
    await run('docker', ['rm', '-f', CONTAINER]).catch(() => {});
  });

  test('the whole schema was created', async () => {
    assert.equal(
      await value("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'"),
      String(TABLE_COUNT),
    );
  });

  test('every table received its rows', async () => {
    assert.equal(await value('SELECT COUNT(*) FROM users'), String(ROWS_PER_TABLE));
    assert.equal(await value('SELECT COUNT(*) FROM agents'), String(ROWS_PER_TABLE));
  });

  test('array columns arrived as arrays, not as text', async () => {
    assert.equal(await value('SELECT pg_typeof(interests)::text FROM users LIMIT 1'), 'character varying[]');
  });

  test('vector columns arrived as vectors of the declared dimension', async () => {
    // Nullable vectors take null by default, so src/rules.ts populates this one deliberately.
    assert.equal(await value('SELECT vector_dims(embeddings) FROM embeddings LIMIT 1'), '1024');
  });

  test('a nullable vector left to the structural default is null, not an invented embedding', async () => {
    assert.equal(await value('SELECT COUNT(*) FROM user_memories WHERE summary_vector_1024 IS NOT NULL'), '0');
  });

  test('every foreign key holds, composite ones included', async () => {
    // The constraints are already enforced by the load; re-validating names any that were deferred.
    const invalid = await value("SELECT COUNT(*) FROM pg_constraint WHERE contype = 'f' AND NOT convalidated");

    assert.equal(invalid, '0');
  });
});
