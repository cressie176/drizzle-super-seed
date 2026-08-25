// The MariaDB files example, end to end: the script generates DDL (drizzle-kit) and extended
// INSERT files (createMariaDbSqlFileSink); this test runs it, loads everything through mysql2,
// and audits the result with foreign key checks on.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import mysql from 'mysql2/promise';
import { migrationStatements } from '../src/migrations.ts';

const run = promisify(execFile);

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDirectory = join(packageRoot, 'docker', 'mariadb');

let connection: mysql.Connection;

const value = async (statement: string): Promise<number> => {
  const [rows] = await connection.query(statement);
  return Number(Object.values((rows as Record<string, unknown>[])[0])[0]);
};

before(async () => {
  await run('npx', ['tsx', 'scripts/mariadb-files.ts'], { cwd: packageRoot, maxBuffer: 8 * 1024 * 1024 });

  connection = await mysql.createConnection({
    host: process.env.MARIADB_HOST ?? 'localhost',
    port: Number(process.env.MARIADB_PORT ?? 3306),
    user: process.env.MARIADB_USER ?? 'drizzle_super_seed',
    password: process.env.MARIADB_PASSWORD ?? 'drizzle_super_seed',
    database: process.env.MARIADB_DATABASE ?? 'drizzle_super_seed',
    multipleStatements: true,
  });

  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  await connection.query('DROP TABLE IF EXISTS lettings, holiday_homes, owners, pitches, parks');
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  for (const statement of await migrationStatements(join(packageRoot, 'drizzle', 'mariadb'))) {
    await connection.query(statement);
  }
  for (const file of (await readdir(dataDirectory)).filter((each) => each.endsWith('.sql')).sort()) {
    await connection.query(await readFile(join(dataDirectory, file), 'utf8'));
  }
});

after(async () => {
  await connection?.end();
});

test('the load produced the production-shaped dataset', async () => {
  assert.equal(await value('SELECT COUNT(*) FROM parks'), 20);
  assert.equal(await value('SELECT COUNT(*) FROM owners'), 5000);
  assert.ok((await value('SELECT COUNT(*) FROM lettings')) > 1000);
});

test('every foreign key joins', async () => {
  const orphans = await value(`
    SELECT
      (SELECT COUNT(*) FROM pitches p LEFT JOIN parks k ON k.id = p.park_id WHERE k.id IS NULL)
    + (SELECT COUNT(*) FROM holiday_homes h LEFT JOIN owners o ON o.id = h.owner_id WHERE o.id IS NULL)
    + (SELECT COUNT(*) FROM lettings l LEFT JOIN holiday_homes h ON h.id = l.holiday_home_id WHERE h.id IS NULL)
  `);

  assert.equal(orphans, 0);
});

test('the data is realistic', async () => {
  const [rows] = await connection.query('SELECT full_name, email FROM owners LIMIT 1');
  const owner = (rows as { full_name: string; email: string }[])[0];

  assert.match(owner.full_name, / /);
  assert.match(owner.email, /@example\.com$/);
});

test('auto increment advances past the inserted ids, with no fix-up file', async () => {
  const [result] = await connection.query(
    "INSERT INTO parks (name, region, opened_at, active) VALUES ('New Park', 'wales', '2024-01-01', 1)",
  );

  assert.equal((result as mysql.ResultSetHeader).insertId, 21);
});
