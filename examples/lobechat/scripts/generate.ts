// LobeChat end to end: read the fetched drizzle-native PostgreSQL schema and write COPY files.
// Run `npm run fetch` first.
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresSqlFileSink, extractCanonicalSchema, generate } from 'drizzle-super-seed';
import { SEED, countsFor } from '../src/counts.ts';
import { buildRules } from '../src/rules.ts';
import * as schema from '../upstream/schemas/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const directory = join(here, '..', 'out');

// Widening puts this example on the dynamic rules path; see src/rules.ts.
const untypedSchema = schema as Record<string, unknown>;

const canonical = extractCanonicalSchema(untypedSchema);
const rules = buildRules(canonical);
const counts = countsFor(canonical.tables.keys());

await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });

const report = await generate(
  { schema: untypedSchema, rules, counts, seed: SEED },
  createPostgresSqlFileSink({ directory }),
);

const rows = Object.values(report.rowCounts).reduce((total, count) => total + count, 0);
console.log(`seed ${report.seed} | tables ${Object.keys(report.rowCounts).length} | rows ${rows}`);
