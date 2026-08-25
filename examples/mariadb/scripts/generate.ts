// The MariaDB files example: numbered extended-INSERT files for the mysql/mariadb client or the
// MariaDB Docker image, from the same domain as the PostgreSQL example. DDL comes from
// drizzle-kit, data from createMariaDbSqlFileSink.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMariaDbSqlFileSink, generate } from 'drizzle-super-seed';
import { productionCounts } from '../src/counts.ts';
import { SEED } from '../src/generators.ts';
import { rules } from '../src/rules.ts';
import * as schema from '../src/schema.ts';
import { generateMigrations, migrationStatements } from '../src/migrations.ts';

const here = dirname(fileURLToPath(import.meta.url));
const directory = join(here, '..', 'out');

await generateMigrations();
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });

const report = await generate(
  { schema, rules, counts: productionCounts, seed: SEED },
  createMariaDbSqlFileSink({ directory }),
);

// The DDL joins the data files, breakpoint comments stripped, so out/ is exactly what the
// MariaDB image's /docker-entrypoint-initdb.d consumes: 0000_ DDL, 0010_+ data, 9000_ finalise.
const ddl = (await migrationStatements(join(here, '..', 'drizzle'))).join('\n');
await writeFile(join(directory, '0000_schema.sql'), `${ddl}\n`);

console.log(`seed ${report.seed}`);
for (const [table, count] of Object.entries(report.rowCounts)) console.log(`${table} ${count}`);
