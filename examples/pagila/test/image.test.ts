// The Pagila example bakes the real DDL and the generated rows into a Postgres image, so
// running it locally is one docker command. This test is the audit: build, start, and check the
// shapes that made Pagila worth validating against.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const example = join(here, '..');

const IMAGE = 'drizzle-super-seed-pagila-smoke';
const CONTAINER = 'drizzle-super-seed-pagila-smoke';
const READY_ATTEMPTS = 120;
const READY_INTERVAL = 1_000;

// TCP, not the socket: the entrypoint's temporary init server disables networking, so a TCP
// probe cannot succeed until the final server is up with the data already loaded.
const psql = (statement: string) =>
  run('docker', [
    'exec',
    CONTAINER,
    'psql',
    '-h',
    '127.0.0.1',
    '-U',
    'postgres',
    '-d',
    'pagila',
    '-t',
    '-A',
    '-c',
    statement,
  ]);

const waitUntilReady = async () => {
  for (let attempt = 0; attempt < READY_ATTEMPTS; attempt++) {
    try {
      await psql('SELECT COUNT(*) FROM rental');
      return;
    } catch {
      await delay(READY_INTERVAL);
    }
  }
  throw new Error('the image never became ready');
};

before(async () => {
  await run('docker', ['rm', '-f', CONTAINER]).catch(() => {});
  await run('npx', ['tsx', 'scripts/generate.ts'], { cwd: example });
  await run('docker', ['build', '-t', IMAGE, '.'], { cwd: example, maxBuffer: 32 * 1024 * 1024 });
  await run('docker', [
    'run',
    '-d',
    '--name',
    CONTAINER,
    '-e',
    'POSTGRES_PASSWORD=pagila',
    '-e',
    'POSTGRES_DB=pagila',
    IMAGE,
  ]);
  await waitUntilReady();
});

after(async () => {
  await run('docker', ['rm', '-f', CONTAINER]).catch(() => {});
});

test('every table holds the rows the manifest records, foreign keys joining', async () => {
  const manifest = JSON.parse(await readFile(join(example, 'out', 'manifest.json'), 'utf8'));

  assert.equal((await psql('SELECT COUNT(*) FROM film')).stdout.trim(), String(manifest.rowCounts.film));
  assert.equal((await psql('SELECT COUNT(*) FROM rental')).stdout.trim(), String(manifest.rowCounts.rental));

  const { stdout: orphans } = await psql(`
    SELECT (SELECT COUNT(*) FROM rental r LEFT JOIN inventory i ON i.inventory_id = r.inventory_id WHERE i.inventory_id IS NULL)
         + (SELECT COUNT(*) FROM inventory i LEFT JOIN film f ON f.film_id = i.film_id WHERE f.film_id IS NULL)
         + (SELECT COUNT(*) FROM store s LEFT JOIN staff m ON m.staff_id = s.manager_staff_id WHERE m.staff_id IS NULL)
  `);
  assert.equal(orphans.trim(), '0');
});

test('the partition-targeted payments show through the partitioned parent', async () => {
  assert.equal((await psql('SELECT COUNT(*) FROM payment')).stdout.trim(), '6000');
});

test('the tsvector rule produced values the database can actually search', async () => {
  assert.equal((await psql("SELECT COUNT(*) FROM film WHERE fulltext @@ to_tsquery('film')")).stdout.trim(), '1000');
});

test('postgres computed the generated column itself', async () => {
  const { stdout } = await psql(
    'SELECT COUNT(*) FROM film WHERE length_hours IS DISTINCT FROM round(length::numeric / 60.0, 2)',
  );
  assert.equal(stdout.trim(), '0');
});

test('the pulled serials advanced their sequences, so the next insert does not collide', async () => {
  const { stdout } = await psql("INSERT INTO language (name) VALUES ('next') RETURNING language_id");
  // psql prints the command tag after the RETURNING value, so only the first line is the id.
  assert.equal(stdout.trim().split('\n')[0], '7');
});
