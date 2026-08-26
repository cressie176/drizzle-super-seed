// Fetches the AdventureWorks DDL (pinned to a commit, transformed to schema-only) and generates
// the data as psql COPY files. The DDL is fetched rather than shipped because the upstream
// repository declares no licence; sql/ is gitignored for the same reason.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TableLogging, createPostgresSqlFileSink, generate } from 'drizzle-super-seed';
import { SEED, counts, rules, seedFaker } from '../src/rules.ts';
import * as schema from '../src/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
const example = join(here, '..');
const PINNED =
  'https://raw.githubusercontent.com/lorint/AdventureWorks-for-Postgres/b474991f0df1c4bf55ca4735eb0254ca0709eed2/install.sql';

const schemaOnly = (installSql: string): string => {
  // Strip the \copy data loads; the remaining UPDATEs touch zero rows on an empty database.
  let ddl = installSql.replaceAll(/^\\copy .*\n/gm, '');
  // The one sample row references a product that does not exist on an empty database.
  const review = ddl.match(/INSERT INTO Production\.ProductReview.*?\);\n/s);
  if (review) ddl = ddl.replace(review[0], '');
  return ddl;
};

export const fetchSchema = async (): Promise<string> => {
  const target = join(example, 'sql', 'adventureworks-schema.sql');
  try {
    return await readFile(target, 'utf8');
  } catch {
    const response = await fetch(PINNED);
    if (!response.ok) throw new Error(`fetching the DDL failed: ${response.status}`);
    const ddl = schemaOnly(await response.text());
    await mkdir(join(example, 'sql'), { recursive: true });
    await writeFile(target, ddl);
    return ddl;
  }
};

await fetchSchema();

const directory = join(example, 'out');
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });

seedFaker(SEED);
const report = await generate(
  { schema, rules, counts, seed: SEED },
  // LeaveLogged: the module cannot declare the composite foreign key the database enforces on
  // salesorderdetail, so the UNLOGGED ordering cannot see that edge and would fail with 42P16.
  createPostgresSqlFileSink({ directory, tableLogging: TableLogging.LeaveLogged }),
);

console.log(`seed ${report.seed}`);
console.log(
  `tables ${Object.keys(report.rowCounts).length}, rows ${Object.values(report.rowCounts).reduce((a, b) => a + b, 0)}`,
);
