// The batch insert example: the generator hands ordered row batches to your own drizzle
// db.insert handler, with foreign key constraints enforced throughout. The tables are created
// from the drizzle schema by drizzle-kit — there is no hand-written DDL anywhere.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgTable } from 'drizzle-orm/pg-core';
import { type RowBatch, createRowBatchSink, generate } from 'drizzle-super-seed';
import pg from 'pg';
import { SEED, seedFaker } from '../src/generators.ts';
import { generateMigrations, migrationStatements } from '../src/migrations.ts';
import { rules } from '../src/rules.ts';
import * as schema from '../src/schema.ts';

const COUNTS = { parks: 2, pitches: 6, owners: 10, holidayHomes: 8, lettings: 20 };

const client = new pg.Client({
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? 'drizzle_super_seed',
  password: process.env.PGPASSWORD ?? 'drizzle_super_seed',
  database: process.env.PGDATABASE ?? 'drizzle_super_seed',
});

const db = drizzle({ client });

const insertBatch = async (batch: RowBatch) => {
  const table = batch.table as PgTable;
  const insert = batch.overrideSystemValue ? db.insert(table).overridingSystemValue() : db.insert(table);
  await insert.values(batch.rows);
};

const dropEverything = async () => {
  await client.query('DROP TABLE IF EXISTS lettings, holiday_homes, owners, pitches, parks CASCADE');
  await client.query('DROP TYPE IF EXISTS letting_status');
};

before(async () => {
  await client.connect();
  await dropEverything();
  for (const statement of await migrationStatements(await generateMigrations())) {
    await client.query(statement);
  }
});

after(async () => {
  await dropEverything();
  await client.end();
});

test('generated rows insert with every foreign key constraint enforced', async () => {
  seedFaker(SEED);
  const report = await generate({ schema, rules, counts: COUNTS, seed: SEED }, createRowBatchSink(insertBatch));

  assert.deepEqual(report.rowCounts, COUNTS);

  const { rows } = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM lettings) AS lettings,
      (SELECT COUNT(*)::int FROM lettings l LEFT JOIN holiday_homes h ON h.id = l.holiday_home_id
         WHERE h.id IS NULL) AS orphans,
      (SELECT full_name FROM owners LIMIT 1) AS a_name
  `);

  assert.equal(rows[0].lettings, COUNTS.lettings);
  assert.equal(rows[0].orphans, 0);
  assert.match(rows[0].a_name, / /, 'faker names reach the database');
});
