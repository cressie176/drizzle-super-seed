// Bangumi end to end: read the fetched drizzle-native MySQL schema, build rules from the canonical
// shape, and write DDL plus extended-INSERT files into out/. Run `npm run fetch` first.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMariaDbSqlFileSink, extractCanonicalSchema, generate } from 'drizzle-super-seed';
import { SEED, countsFor } from '../src/counts.ts';
import { repairDdl } from '../src/ddl-repairs.ts';
import { generateMigrations, migrationStatements } from '../src/migrations.ts';
import { buildRules } from '../src/rules.ts';
import * as schema from '../upstream/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
const directory = join(here, '..', 'out');

// Widening the module is what puts this example on the dynamic path. Given the real module type,
// SchemaRules names all 61 tables and the compiler rejects the object the loop builds, which is the
// typed path working exactly as intended. Widening gives that check up in exchange for not writing
// 548 rules by hand. See src/rules.ts.
const untypedSchema = schema as Record<string, unknown>;

const canonical = extractCanonicalSchema(untypedSchema);
const rules = buildRules(canonical);
const counts = countsFor(canonical.tables.keys());

await generateMigrations();
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });

const report = await generate(
  { schema: untypedSchema, rules, counts, seed: SEED },
  createMariaDbSqlFileSink({ directory }),
);

const statements = await migrationStatements(join(here, '..', 'drizzle'));
await writeFile(join(directory, '0000_schema.sql'), `${repairDdl(statements)}\n`);

const rows = Object.values(report.rowCounts).reduce((total, count) => total + count, 0);
console.log(`seed ${report.seed} | tables ${Object.keys(report.rowCounts).length} | rows ${rows}`);
