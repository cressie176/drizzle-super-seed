import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgTable } from 'drizzle-orm/pg-core';
import { type RowBatch, createRowBatchSink, generate } from 'drizzle-super-seed';
import pg from 'pg';
import { rules } from '../src/rules.ts';
import * as schema from '../src/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));

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

before(async () => {
  await client.connect();
  await db.execute(
    sql.raw(
      'DROP TABLE IF EXISTS lettings, holiday_homes, owners, pitches, parks CASCADE; DROP TYPE IF EXISTS letting_status',
    ),
  );
  await db.execute(sql.raw(await readFile(join(here, '..', 'src', 'schema.sql'), 'utf8')));
});

after(async () => {
  await db.execute(
    sql.raw(
      'DROP TABLE IF EXISTS lettings, holiday_homes, owners, pitches, parks CASCADE; DROP TYPE IF EXISTS letting_status',
    ),
  );
  await client.end();
});

test('generated rows insert with every foreign key constraint enforced', async () => {
  const report = await generate({ schema, rules, counts: COUNTS, seed: 42 }, createRowBatchSink(insertBatch));

  assert.deepEqual(report.rowCounts, COUNTS);

  const { rows } = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM lettings) AS lettings,
      (SELECT COUNT(*)::int FROM lettings l LEFT JOIN holiday_homes h ON h.id = l.holiday_home_id
         WHERE h.id IS NULL) AS orphans
  `);

  assert.equal(rows[0].lettings, COUNTS.lettings);
  assert.equal(rows[0].orphans, 0);
});
