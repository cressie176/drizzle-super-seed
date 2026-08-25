// The MariaDB files example: numbered extended-INSERT files for the mysql/mariadb client or the
// MariaDB Docker image, from the same domain as the PostgreSQL example. DDL comes from
// drizzle-kit, data from createMariaDbSqlFileSink.
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMariaDbSqlFileSink, generate } from 'drizzle-super-seed';
import { productionCounts } from '../src/counts.ts';
import { SEED } from '../src/generators.ts';
import { rules } from '../src/mariadb/rules.ts';
import * as schema from '../src/mariadb/schema.ts';
import { generateMigrations } from '../src/migrations.ts';

const here = dirname(fileURLToPath(import.meta.url));
const directory = join(here, '..', 'docker', 'mariadb');

await generateMigrations('drizzle-mariadb.config.ts');
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });

const report = await generate(
  { schema, rules, counts: productionCounts, seed: SEED },
  createMariaDbSqlFileSink({ directory }),
);

console.log(`seed ${report.seed}`);
for (const [table, count] of Object.entries(report.rowCounts)) console.log(`${table} ${count}`);
