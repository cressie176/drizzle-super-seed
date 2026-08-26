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

const IMAGE = 'drizzle-super-seed-pagila-prebaked-smoke';
const CONTAINER = 'drizzle-super-seed-pagila-prebaked-smoke';
// Baked at build time, so readiness is server startup alone: the window is deliberately short.
const READY_ATTEMPTS = 30;
const READY_INTERVAL = 1_000;

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
  throw new Error('the prebaked image never became ready');
};

before(async () => {
  await run('docker', ['rm', '-f', CONTAINER]).catch(() => {});
  await run('npx', ['tsx', 'scripts/generate.ts'], { cwd: example });
  await run('docker', ['build', '-f', 'Dockerfile.prebaked', '-t', IMAGE, '.'], {
    cwd: example,
    maxBuffer: 32 * 1024 * 1024,
  });
  // No environment at all: the credentials were fixed when the image was built.
  await run('docker', ['run', '-d', '--name', CONTAINER, IMAGE]);
  await waitUntilReady();
});

after(async () => {
  await run('docker', ['rm', '-f', CONTAINER]).catch(() => {});
});

test('the container serves the baked Pagila without replaying the load', async () => {
  assert.equal((await psql('SELECT COUNT(*) FROM rental')).stdout.trim(), '8000');
  assert.equal((await psql('SELECT COUNT(*) FROM payment')).stdout.trim(), '6000');
});

test('the sequences are ready for the next insert', async () => {
  const { stdout } = await psql("INSERT INTO language (name) VALUES ('next') RETURNING language_id");
  assert.equal(stdout.trim().split('\n')[0], '7');
});
