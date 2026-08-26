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

const IMAGE = 'drizzle-super-seed-park-prebaked-smoke';
const CONTAINER = 'drizzle-super-seed-park-prebaked-smoke';
// The point of baking at build time is a fast start: the data is already in the image layers,
// so readiness is server startup alone, not a replay of the whole load.
const READY_ATTEMPTS = 30;
const READY_INTERVAL = 1_000;

// Probes go over TCP, not the socket: the entrypoint's temporary init server disables
// networking, so a TCP probe cannot succeed until the final server is up, data loaded.
const psql = (statement: string) =>
  run('docker', [
    'exec',
    CONTAINER,
    'psql',
    '-h',
    '127.0.0.1',
    '-U',
    'park',
    '-d',
    'park',
    '-t',
    '-A',
    '-c',
    statement,
  ]);

const waitUntilReady = async () => {
  for (let attempt = 0; attempt < READY_ATTEMPTS; attempt++) {
    try {
      await psql('SELECT COUNT(*) FROM lettings');
      return;
    } catch {
      await delay(READY_INTERVAL);
    }
  }
  throw new Error('the prebaked image never became ready');
};

before(async () => {
  await run('docker', ['rm', '-f', CONTAINER]).catch(() => {});
  await run('npx', ['tsx', 'scripts/generate.ts'], {
    cwd: example,
    env: { ...process.env, SEED: '42' },
  });
  await run('docker', ['build', '-f', 'Dockerfile.prebaked', '-t', IMAGE, '.'], {
    cwd: example,
    maxBuffer: 32 * 1024 * 1024,
  });
  await run('docker', ['run', '-d', '--name', CONTAINER, '-e', 'POSTGRES_PASSWORD=park', IMAGE]);
  await waitUntilReady();
});

after(async () => {
  await run('docker', ['rm', '-f', CONTAINER]).catch(() => {});
});

test('the container serves the baked data without replaying the load', async () => {
  const { stdout } = await psql('SELECT COUNT(*) FROM lettings');

  assert.ok(Number(stdout.trim()) > 10_000, `expected a production sized dataset, got ${stdout.trim()}`);
});

test('the sequences are ready for the next insert', async () => {
  const { stdout } = await psql(
    "INSERT INTO parks (name, region, opened_at, active) VALUES ('New Park', 'wales', '2024-01-01', true) RETURNING id",
  );

  assert.equal(stdout.trim().split('\n')[0], '21');
});
