// The PostgreSQL files example: bulk SQL files at COPY speed, consumed by the two-line
// Dockerfile beside this package. The DDL is generated from the drizzle schema by drizzle-kit,
// so the schema module is the single source of truth for structure and data alike.
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresSqlFileSink, generate } from 'drizzle-super-seed';
import { productionCounts } from '../src/counts.ts';
import { SEED } from '../src/generators.ts';
import { generateMigrations } from '../src/migrations.ts';
import { rules } from '../src/postgres/rules.ts';
import * as schema from '../src/postgres/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
const directory = join(here, '..', 'docker', 'initdb');

await generateMigrations('drizzle-postgres.config.ts');
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });

const report = await generate(
  { schema, rules, counts: productionCounts, seed: SEED },
  createPostgresSqlFileSink({ directory }),
);

console.log(`seed ${report.seed}`);
for (const [table, count] of Object.entries(report.rowCounts)) console.log(`${table} ${count}`);
