// The Pagila example's test is the introspection workflow end to end: load the real DDL into a
// fresh database on the repository's compose PostgreSQL (npm run db:up), generate, load the
// files back, and assert the shapes that made Pagila worth validating against.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const example = join(here, '..');
const DATABASE = 'pagila_example';
const MAX_BUFFER = 32 * 1024 * 1024;

const compose = (args: string[], input?: string) =>
  new Promise<string>((resolve, reject) => {
    const child = execFile(
      'docker',
      ['compose', 'exec', '-T', 'postgres', ...args],
      { cwd: join(example, '..', '..'), maxBuffer: MAX_BUFFER },
      (error, stdout, stderr) => (error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(stdout)),
    );
    child.stdin?.end(input ?? '');
  });

const psql = (statement: string, database = DATABASE) =>
  compose(['psql', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-U', 'drizzle_super_seed', '-d', database, '-c', statement]);

const psqlScript = (script: string, database = DATABASE) =>
  compose(['psql', '-v', 'ON_ERROR_STOP=1', '-U', 'drizzle_super_seed', '-d', database], script);

before(async () => {
  await run('npx', ['tsx', 'scripts/generate.ts'], { cwd: example });

  await psql(`DROP DATABASE IF EXISTS ${DATABASE}`, 'drizzle_super_seed');
  await psql(`CREATE DATABASE ${DATABASE}`, 'drizzle_super_seed');
  const ddl = await readFile(join(example, 'sql', 'pagila-schema.sql'), 'utf8');
  await psqlScript(ddl.replaceAll('OWNER TO postgres', 'OWNER TO drizzle_super_seed'));

  const out = join(example, 'out');
  for (const file of (await readdir(out)).filter((each) => /^\d{5}_/.test(each)).sort()) {
    await psqlScript(await readFile(join(out, file), 'utf8'));
  }
});

test('every table loads the rows the manifest records, foreign keys enforced by the finalised state', async () => {
  const manifest = JSON.parse(await readFile(join(example, 'out', 'manifest.json'), 'utf8'));

  assert.equal(await psql('SELECT COUNT(*) FROM film'), `${manifest.rowCounts.film}\n`);
  assert.equal(await psql('SELECT COUNT(*) FROM rental'), `${manifest.rowCounts.rental}\n`);

  const orphans = await psql(`
    SELECT (SELECT COUNT(*) FROM rental r LEFT JOIN inventory i ON i.inventory_id = r.inventory_id WHERE i.inventory_id IS NULL)
         + (SELECT COUNT(*) FROM inventory i LEFT JOIN film f ON f.film_id = i.film_id WHERE f.film_id IS NULL)
         + (SELECT COUNT(*) FROM store s LEFT JOIN staff m ON m.staff_id = s.manager_staff_id WHERE m.staff_id IS NULL)
  `);
  assert.equal(orphans.trim(), '0');
});

test('the partition-targeted payments show through the partitioned parent', async () => {
  assert.equal((await psql('SELECT COUNT(*) FROM payment')).trim(), '6000');
});

test('the tsvector rule produced values the database can actually search', async () => {
  assert.equal((await psql("SELECT COUNT(*) FROM film WHERE fulltext @@ to_tsquery('film')")).trim(), '1000');
});

test('postgres computed the generated column itself', async () => {
  const wrong = await psql(
    'SELECT COUNT(*) FROM film WHERE length_hours IS DISTINCT FROM round(length::numeric / 60.0, 2)',
  );
  assert.equal(wrong.trim(), '0');
});

test('the pulled serials advanced their sequences, so the next insert does not collide', async () => {
  const next = await psql("INSERT INTO language (name) VALUES ('next') RETURNING language_id");
  // psql prints the command tag after the RETURNING value, so only the first line is the id.
  assert.equal(next.trim().split('\n')[0], '7');
});
