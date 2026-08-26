// The CSV example: numbered RFC 4180 files a person can review, diff or hand to a spreadsheet.
// No DDL and no database: the artefact is the point.
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCsvFileSink, generate } from 'drizzle-super-seed';
import { productionCounts } from '../src/counts.ts';
import { SEED } from '../src/generators.ts';
import { rules } from '../src/rules.ts';
import * as schema from '../src/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
const directory = join(here, '..', 'out');

await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });

const report = await generate(
  { schema, rules, counts: productionCounts, seed: SEED },
  createCsvFileSink({ directory }),
);

console.log(`seed ${report.seed}`);
for (const [table, count] of Object.entries(report.rowCounts)) console.log(`${table} ${count}`);
