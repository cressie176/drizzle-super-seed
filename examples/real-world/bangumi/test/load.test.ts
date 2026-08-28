// Bangumi end to end: fetch the upstream schema, generate DDL and data, load the lot into MariaDB
// and check it arrived. The server runs with STRICT_TRANS_TABLES, so a value the serialiser got
// wrong is an error here rather than a silent coercion.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import mysql from 'mysql2/promise';
import { ROWS_PER_TABLE } from '../src/counts.ts';

const run = promisify(execFile);

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDirectory = join(packageRoot, 'out');

const TABLE_COUNT = 61;

let connection: mysql.Connection;

const value = async (statement: string): Promise<number> => {
  const [rows] = await connection.query(statement);
  return Number(Object.values((rows as Record<string, unknown>[])[0])[0]);
};

const dropUpstreamTables = async (): Promise<void> => {
  const [rows] = await connection.query(
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name LIKE 'chii\\_%'",
  );
  const names = (rows as { name: string }[]).map((row) => `\`${row.name}\``);
  if (names.length === 0) return;
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  await connection.query(`DROP TABLE ${names.join(', ')}`);
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');
};

before(async () => {
  await run('npx', ['tsx', 'scripts/fetch-schema.ts'], { cwd: packageRoot });
  await run('npx', ['tsx', 'scripts/generate.ts'], { cwd: packageRoot, maxBuffer: 8 * 1024 * 1024 });

  connection = await mysql.createConnection({
    host: process.env.MARIADB_HOST ?? 'localhost',
    port: Number(process.env.MARIADB_PORT ?? 3306),
    user: process.env.MARIADB_USER ?? 'drizzle_super_seed',
    password: process.env.MARIADB_PASSWORD ?? 'drizzle_super_seed',
    database: process.env.MARIADB_DATABASE ?? 'drizzle_super_seed',
    multipleStatements: true,
  });

  await dropUpstreamTables();
  for (const file of (await readdir(dataDirectory)).filter((each) => each.endsWith('.sql')).sort()) {
    await connection.query(await readFile(join(dataDirectory, file), 'utf8'));
  }
});

after(async () => {
  await connection?.end();
});

test('the repaired DDL created every upstream table', async () => {
  const tables = await value(
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name LIKE 'chii\\_%'",
  );

  assert.equal(tables, TABLE_COUNT);
});

test('the server is strict, so a badly serialised value would have failed the load', async () => {
  const [rows] = await connection.query('SELECT @@sql_mode AS mode');

  assert.match((rows as { mode: string }[])[0].mode, /STRICT_TRANS_TABLES/);
});

test('every table received its rows', async () => {
  assert.equal(await value('SELECT COUNT(*) FROM chii_members'), ROWS_PER_TABLE);
  assert.equal(await value('SELECT COUNT(*) FROM chii_subjects'), ROWS_PER_TABLE);
  assert.equal(await value('SELECT COUNT(*) FROM chii_blog_entry'), ROWS_PER_TABLE);
});

test('the kinds the library generates itself round trip', async () => {
  const [rows] = await connection.query('SELECT field_date FROM chii_subject_fields LIMIT 1');
  assert.match(String((rows as { field_date: Date }[])[0].field_date), /\d{4}/);

  const enums = await value("SELECT COUNT(*) FROM chii_pms WHERE msg_folder IN ('inbox', 'outbox')");
  assert.equal(enums, ROWS_PER_TABLE);
});

test('customType columns took the value their wrapped SQL type stores', async () => {
  const booleans = await value('SELECT COUNT(*) FROM chii_blog_entry WHERE entry_public IN (0, 1)');

  assert.equal(booleans, ROWS_PER_TABLE);
});
