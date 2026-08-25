// The SQLite example: there is deliberately no SQLite file sink — the database is embedded, so a
// single transaction of inserts through the row batch sink is already the fast path. This script
// builds a complete file-backed database from the drizzle schema and rules, ready to commit or
// hand to tests.
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { createRowBatchSink, generate } from 'drizzle-super-seed';
import { productionCounts } from '../src/counts.ts';
import { SEED } from '../src/generators.ts';
import { generateMigrations, migrationStatements } from '../src/migrations.ts';
import { rules } from '../src/rules.ts';
import * as schema from '../src/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '..', 'fixtures', 'park.db');

const migrations = await generateMigrations();
await rm(dirname(file), { recursive: true, force: true });
await mkdir(dirname(file), { recursive: true });

const database = new Database(file);
database.pragma('journal_mode = WAL');
database.pragma('foreign_keys = ON');
for (const statement of await migrationStatements(migrations)) database.exec(statement);

const db = drizzle({ client: database });

const report = await generate(
  { schema, rules, counts: productionCounts, seed: SEED },
  createRowBatchSink((batch) => {
    db.insert(batch.table as SQLiteTable)
      .values(batch.rows)
      .run();
  }),
);

database.close();
console.log(`seed ${report.seed} -> ${file}`);
for (const [table, count] of Object.entries(report.rowCounts)) console.log(`${table} ${count}`);
