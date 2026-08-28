// Downloads the pinned upstream schema module into upstream/, which is gitignored. Run this once
// before generate; every other script assumes the file is present.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMIT, REPOSITORY, schemaUrl } from '../src/upstream.ts';

const directory = join(dirname(fileURLToPath(import.meta.url)), '..', 'upstream');

const response = await fetch(schemaUrl());
if (!response.ok) throw new Error(`${schemaUrl()} responded ${response.status}`);

await mkdir(directory, { recursive: true });
await writeFile(join(directory, 'schema.ts'), await response.text());

console.log(`fetched ${REPOSITORY} at ${COMMIT.slice(0, 7)}`);
