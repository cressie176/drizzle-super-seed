import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresSqlFileSink, generate } from 'drizzle-super-seed';
import { productionCounts } from '../src/counts.ts';
import { rules } from '../src/rules.ts';
import * as schema from '../src/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
const directory = join(here, '..', 'docker', 'initdb');

const seed = Number(process.env.SEED ?? 42);

await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });

const report = await generate(
  { schema, rules, counts: productionCounts, seed },
  createPostgresSqlFileSink({ directory }),
);

console.log(`seed ${report.seed}`);
for (const [table, count] of Object.entries(report.rowCounts)) console.log(`${table} ${count}`);
