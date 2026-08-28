// Downloads the pinned upstream schema module into upstream/, which is gitignored. Run this once
// before generate; every other script assumes the file is present.
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMIT, REPOSITORY, schemaUrl } from '../src/upstream.ts';

const directory = join(dirname(fileURLToPath(import.meta.url)), '..', 'upstream');
const schemaFile = join(directory, 'schema.ts');

// The commit is pinned, so a schema already on disk is already the right one. Skipping the
// download makes this cheap enough to run before every typecheck and test, which is what keeps
// the package working from a clean checkout without anyone having to remember a step.
const alreadyFetched = await access(schemaFile).then(
  () => true,
  () => false,
);

if (alreadyFetched) {
  console.log(`${REPOSITORY} at ${COMMIT.slice(0, 7)} already fetched`);
  process.exit(0);
}

const response = await fetch(schemaUrl());
if (!response.ok) throw new Error(`${schemaUrl()} responded ${response.status}`);

await mkdir(directory, { recursive: true });
await writeFile(schemaFile, await response.text());

console.log(`fetched ${REPOSITORY} at ${COMMIT.slice(0, 7)}`);
