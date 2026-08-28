// Downloads the pinned upstream tree into upstream/, which is gitignored. The archive's top level
// directory is named after the GitHub organisation rather than the repository, so it is read from
// the archive rather than assumed. Test directories are dropped: they pull in vitest and a live
// database helper, and nothing here runs them.
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { COMMIT, REPOSITORY, WANTED_PATHS, tarballUrl } from '../src/upstream.ts';

const run = promisify(execFile);

const destination = join(dirname(fileURLToPath(import.meta.url)), '..', 'upstream');

// Only the first entry is wanted, and listing the whole archive is megabytes of output.
const archivePrefix = async (archive: string): Promise<string> => {
  const { stdout } = await run('sh', ['-c', `tar -tzf ${JSON.stringify(archive)} | head -1`]);
  return stdout.trim().split('/')[0];
};

// These are somebody else's sources, fetched without the workspace packages and TypeScript
// configuration they were written against, so they will not typecheck here and it is not this
// example's business to make them. tsx erases their types to run them; tsc is told to skip them.
// Our own code, under src/ and scripts/, is typechecked normally.
const excludeFromTypeChecking = async (directory: string): Promise<void> => {
  const { stdout } = await run('sh', ['-c', `find ${JSON.stringify(directory)} -name '*.ts'`]);
  for (const file of stdout.trim().split('\n')) {
    await writeFile(file, `// @ts-nocheck\n${await readFile(file, 'utf8')}`);
  }
};

const staging = await mkdtemp(join(tmpdir(), 'lobechat-'));
const archive = join(staging, 'repo.tar.gz');

const response = await fetch(tarballUrl());
if (!response.ok) throw new Error(`${tarballUrl()} responded ${response.status}`);
await writeFile(archive, Buffer.from(await response.arrayBuffer()));

const prefix = await archivePrefix(archive);
await run('tar', ['-xzf', archive, '-C', staging, ...WANTED_PATHS.map((path) => `${prefix}/${path}`)]);

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

const database = join(staging, prefix, 'packages', 'database', 'src');
await run('cp', ['-R', join(database, 'schemas'), join(destination, 'schemas')]);
await run('cp', ['-R', join(database, 'types'), join(destination, 'types')]);
await run('cp', ['-R', join(database, 'utils'), join(destination, 'utils')]);
await mkdir(join(destination, 'const'), { recursive: true });
for (const file of ['goal.ts', 'verify.ts']) {
  await run('cp', [join(staging, prefix, 'packages', 'const', 'src', file), join(destination, 'const', file)]);
}

await rm(join(destination, 'schemas', '__tests__'), { recursive: true, force: true });
await excludeFromTypeChecking(destination);
await rm(staging, { recursive: true, force: true });

console.log(`fetched ${REPOSITORY} at ${COMMIT.slice(0, 7)}`);
