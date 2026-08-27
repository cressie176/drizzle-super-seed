// The CSV example's test reviews the files as files: no database, nothing to bring up.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createCsvFileSink, generate } from 'drizzle-super-seed';
import { testCounts } from '../src/counts.ts';
import { SEED, seedFaker } from '../src/generators.ts';
import { rules } from '../src/rules.ts';
import * as schema from '../src/schema.ts';

const run = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const example = join(here, '..');
const out = join(example, 'out');

// A minimal RFC 4180 record counter: a newline inside a quoted field continues the record, so
// counting raw lines would miscount the moment a value carries one.
const recordsOf = (csv: string): string[] => {
  const records: string[] = [];
  let field = '';
  let quoted = false;
  for (const character of csv) {
    if (character === '"') quoted = !quoted;
    if (character === '\n' && !quoted) {
      records.push(field);
      field = '';
      continue;
    }
    field += character;
  }
  if (field.length > 0) records.push(field);
  return records;
};

let manifest: { rowCounts: Record<string, number>; files: string[]; seed: number };

before(async () => {
  await run('npx', ['tsx', 'scripts/generate.ts'], { cwd: example, env: { ...process.env, SEED: String(SEED) } });
  manifest = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'));
});

test('every file holds exactly the rows the manifest records, plus its header', async () => {
  for (const file of manifest.files) {
    const [, tableKey] = file.replace('.csv', '').split('_');
    const records = recordsOf(await readFile(join(out, file), 'utf8'));

    assert.equal(records.length - 1, manifest.rowCounts[tableKey], `${file} disagrees with the manifest`);
  }
});

test('the header row carries the database column names', async () => {
  const [header] = recordsOf(await readFile(join(out, 'seed-00020_parks.csv'), 'utf8'));

  assert.equal(header, 'id,name,region,opened_at,latitude,amenities,active');
});

test('a null is visibly different from an empty string in the raw text', async () => {
  // A dedicated tiny run, so both cases are pinned rather than hoped for: the first owner's
  // referrer is null and the second's name is the empty string.
  seedFaker(SEED);
  const directory = await mkdtemp(join(tmpdir(), 'drizzle-super-seed-csv-'));
  await generate(
    {
      schema,
      rules,
      counts: testCounts,
      seed: SEED,
      overrides: { owners: [{ referredByOwnerId: null }, { fullName: '' }] },
    },
    createCsvFileSink({ directory }),
  );
  const [, first, second] = recordsOf(await readFile(join(directory, 'seed-00010_owners.csv'), 'utf8'));

  assert.match(first, /,$/, 'a null renders as a bare empty field');
  assert.match(second, /,"",/, 'an empty string renders quoted');
});

test('a parsed sample row holds realistic values', async () => {
  const [, sample] = recordsOf(await readFile(join(out, 'seed-00010_owners.csv'), 'utf8'));
  const [id, fullName, email] = sample.split(',');

  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.match(fullName, /^[A-Z][\S]*.* /, 'a faker name, not word soup');
  assert.match(email, /@example\.com$/);
});
