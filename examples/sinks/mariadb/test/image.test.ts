import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const example = join(here, '..');

const IMAGE = 'drizzle-super-seed-park-mariadb-smoke';
const CONTAINER = 'drizzle-super-seed-park-mariadb-smoke';
const READY_ATTEMPTS = 120;
const READY_INTERVAL = 1_000;

// Probes go over TCP, not the socket: the entrypoint's temporary init server disables
// networking, so a TCP probe cannot succeed until the final server is up, data loaded.
const sql = (statement: string) =>
  run('docker', ['exec', CONTAINER, 'mariadb', '-h127.0.0.1', '-upark', '-ppark', 'park', '-N', '-B', '-e', statement]);

const waitUntilReady = async () => {
  for (let attempt = 0; attempt < READY_ATTEMPTS; attempt++) {
    try {
      // Readiness is the data being loaded, not the server answering: the entrypoint restarts
      // the server after running /docker-entrypoint-initdb.d.
      await sql('SELECT COUNT(*) FROM lettings');
      return;
    } catch {
      await delay(READY_INTERVAL);
    }
  }
  throw new Error('the image never became ready');
};

before(async () => {
  await run('docker', ['rm', '-f', CONTAINER]).catch(() => {});
  await run('npx', ['tsx', 'scripts/generate.ts'], {
    cwd: example,
    env: { ...process.env, SEED: '42' },
  });
  await run('docker', ['build', '-t', IMAGE, '.'], { cwd: example, maxBuffer: 32 * 1024 * 1024 });
  await run('docker', [
    'run',
    '-d',
    '--name',
    CONTAINER,
    '-e',
    'MARIADB_ROOT_PASSWORD=park',
    '-e',
    'MARIADB_DATABASE=park',
    '-e',
    'MARIADB_USER=park',
    '-e',
    'MARIADB_PASSWORD=park',
    IMAGE,
  ]);
  await waitUntilReady();
});

after(async () => {
  await run('docker', ['rm', '-f', CONTAINER]).catch(() => {});
});

test('the built image starts with the generated data already loaded', async () => {
  const { stdout } = await sql('SELECT COUNT(*) FROM lettings');

  assert.ok(Number(stdout.trim()) > 1_000, `expected a production sized dataset, got ${stdout.trim()}`);
});

test('the loaded data satisfies the foreign key constraints the schema declares', async () => {
  const { stdout } = await sql(`
    SELECT
      (SELECT COUNT(*) FROM lettings l LEFT JOIN holiday_homes h ON h.id = l.holiday_home_id WHERE h.id IS NULL)
    + (SELECT COUNT(*) FROM holiday_homes h LEFT JOIN pitches p ON p.id = h.pitch_id WHERE p.id IS NULL)
    + (SELECT COUNT(*) FROM pitches p LEFT JOIN parks k ON k.id = p.park_id WHERE k.id IS NULL)
  `);

  assert.equal(stdout.trim(), '0');
});

test('auto increment is already past the inserted ids', async () => {
  await sql("INSERT INTO parks (name, region, opened_at, active) VALUES ('New Park', 'wales', '2024-01-01', 1)");
  const { stdout } = await sql('SELECT MAX(id) FROM parks');

  assert.equal(stdout.trim(), '21');
});
