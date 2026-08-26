// Generate Pagila-shaped data as psql COPY files. LeaveLogged, deliberately: the database holds
// 55 payment partitions this module trimmed away, and one of them referencing rental would fail
// the UNLOGGED file with the documented 42P16 - the trimmed-module trap from the README.
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TableLogging, createPostgresSqlFileSink, generate } from 'drizzle-super-seed';
import { counts, rules } from '../src/rules.ts';
import * as schema from '../src/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
const directory = join(here, '..', 'out');

await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });

const report = await generate(
  { schema, rules, counts, seed: 42 },
  createPostgresSqlFileSink({ directory, tableLogging: TableLogging.LeaveLogged }),
);

console.log(`seed ${report.seed}`);
for (const [table, count] of Object.entries(report.rowCounts)) console.log(`${table} ${count}`);
