// The SQLite example, end to end: the script builds a complete file-backed database from the
// drizzle schema (DDL via drizzle-kit) and rules; this test runs it and audits the result.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';

const run = promisify(execFile);

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const databaseFile = join(packageRoot, 'fixtures', 'park.db');

let database: InstanceType<typeof Database>;

before(async () => {
  await run('npx', ['tsx', 'scripts/sqlite-database.ts'], { cwd: packageRoot, maxBuffer: 8 * 1024 * 1024 });
  database = new Database(databaseFile, { readonly: false });
  database.pragma('foreign_keys = ON');
});

test('the script produced the production-shaped dataset', () => {
  const count = (table: string) =>
    (database.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number }).total;

  assert.equal(count('parks'), 20);
  assert.equal(count('owners'), 5000);
  assert.ok(count('lettings') > 1000);
});

test('foreign keys hold under PRAGMA foreign_key_check', () => {
  assert.deepEqual(database.pragma('foreign_key_check'), []);
});

test('the data is realistic', () => {
  const owner = database.prepare('SELECT full_name, email FROM owners LIMIT 1').get() as {
    full_name: string;
    email: string;
  };

  assert.match(owner.full_name, / /);
  assert.match(owner.email, /@example\.com$/);
});

test('the rowid sequence is ready for the next insert', () => {
  const { lastInsertRowid } = database
    .prepare("INSERT INTO parks (name, region, opened_at, active) VALUES ('New Park', 'wales', 0, 1)")
    .run();

  assert.equal(Number(lastInsertRowid), 21);
});
