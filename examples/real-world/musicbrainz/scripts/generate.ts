// Fetches the MusicBrainz DDL (pinned to a commit) and generates the data as psql COPY files.
// The DDL is fetched rather than shipped because musicbrainz-server is GPL-2.0-or-later and
// this repository is MIT; sql/ stays gitignored for the same reason. LeaveLogged, deliberately:
// the database holds two partitioned parents this module cannot see (artist_release,
// artist_release_group), one of which references release, so the UNLOGGED file would fail with
// the documented 42P16 - the trimmed-module trap from the README, by its third route.
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TableLogging, createPostgresSqlFileSink, generate } from 'drizzle-super-seed';
import { counts } from '../src/counts.ts';
import { rules } from '../src/rules.ts';
import * as schema from '../src/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
const example = join(here, '..');

const PINNED_COMMIT = '5d91d1f4df996e3c593d290d28d89f03f1c10536'; // v-2026-07-30.1
const UPSTREAM = `https://raw.githubusercontent.com/metabrainz/musicbrainz-server/${PINNED_COMMIT}/admin/sql`;

// InitDb.pl's own order for a standalone database, musicbrainz schema only; the image's init
// script runs them in this order too, so the array is written where both readers can see it.
export const DDL_FILES = [
  'Extensions',
  'CreateCollations',
  'CreateTypes',
  'CreateTables',
  'CreatePrimaryKeys',
  'CreateSearchConfiguration',
  'CreateFunctions',
  'CreateIndexes',
  'CreateFKConstraints',
  'CreateConstraints',
];

export const fetchDdl = async (): Promise<void> => {
  const sql = join(example, 'sql');
  await mkdir(sql, { recursive: true });
  for (const file of DDL_FILES) {
    const target = join(sql, `${file}.sql`);
    if (await stat(target).catch(() => null)) continue;
    const response = await fetch(`${UPSTREAM}/${file}.sql`);
    if (!response.ok) throw new Error(`fetching ${file}.sql failed: ${response.status}`);
    await writeFile(target, await response.text());
  }
};

await fetchDdl();

const directory = join(example, 'out');
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });

const report = await generate(
  { schema, rules, counts, seed: 42 },
  createPostgresSqlFileSink({ directory, tableLogging: TableLogging.LeaveLogged }),
);

console.log(`seed ${report.seed}`);
console.log(
  `tables ${Object.keys(report.rowCounts).length}, rows ${Object.values(report.rowCounts).reduce((a, b) => a + b, 0)}`,
);
