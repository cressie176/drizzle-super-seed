// MusicBrainz in a box: 372 tables, 663 CHECK constraints live during the load, and the audit
// asks the catalogue itself whether every one of the 770 foreign keys holds - including the
// four the introspected module cannot see, which belong to the partitioned parents.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const example = join(here, '..');

const IMAGE = 'drizzle-super-seed-musicbrainz-smoke';
const CONTAINER = 'drizzle-super-seed-musicbrainz-smoke';
const READY_ATTEMPTS = 120;
const READY_INTERVAL = 1_000;

// TCP, not the socket: the entrypoint's temporary init server disables networking, so a TCP
// probe cannot succeed until the final server is up with the data already loaded.
const psql = (statement: string) =>
  run('docker', [
    'exec',
    CONTAINER,
    'psql',
    '-h',
    '127.0.0.1',
    '-U',
    'postgres',
    '-d',
    'musicbrainz',
    '-t',
    '-A',
    '-c',
    statement,
  ]);

const waitUntilReady = async () => {
  for (let attempt = 0; attempt < READY_ATTEMPTS; attempt++) {
    try {
      await psql('SELECT COUNT(*) FROM musicbrainz.recording');
      return;
    } catch {
      await delay(READY_INTERVAL);
    }
  }
  throw new Error('the image never became ready');
};

before(async () => {
  await run('docker', ['rm', '-f', CONTAINER]).catch(() => {});
  await run('npx', ['tsx', 'scripts/generate.ts'], { cwd: example });
  await run('docker', ['build', '-t', IMAGE, '.'], { cwd: example, maxBuffer: 32 * 1024 * 1024 });
  await run('docker', [
    'run',
    '-d',
    '--name',
    CONTAINER,
    '-e',
    'POSTGRES_PASSWORD=mb',
    '-e',
    'POSTGRES_DB=musicbrainz',
    IMAGE,
  ]);
  await waitUntilReady();
});

after(async () => {
  await run('docker', ['rm', '-f', CONTAINER]).catch(() => {});
});

test('all 372 seeded tables hold exactly the rows the manifest records', async () => {
  const manifest = JSON.parse(await readFile(join(example, 'out', 'manifest.json'), 'utf8'));
  const tables = Object.keys(manifest.rowCounts);
  assert.equal(tables.length, 372);

  const { stdout } = await psql(`
    SELECT SUM(n_live_tup) FROM pg_stat_user_tables WHERE schemaname = 'musicbrainz'
  `);
  const expected = Object.values(manifest.rowCounts).reduce((a: number, b) => a + Number(b), 0);
  assert.equal(Number(stdout.trim()), expected);
});

test('every one of the 770 foreign keys holds, asked of the catalogue itself', async () => {
  const { stdout } = await psql(`
    SELECT COUNT(*) FROM pg_constraint pc
    JOIN pg_namespace n ON n.oid = pc.connamespace
    WHERE contype = 'f' AND n.nspname = 'musicbrainz'
  `);
  assert.equal(stdout.trim(), '770');

  const audit = await run('docker', [
    'exec',
    CONTAINER,
    'psql',
    '-h',
    '127.0.0.1',
    '-U',
    'postgres',
    '-d',
    'musicbrainz',
    '-c',
    `DO $$
     DECLARE fk record; orphans bigint; bad int := 0;
     BEGIN
       FOR fk IN
         SELECT c.conname,
                c.conrelid::regclass AS child,
                c.confrelid::regclass AS parent,
                (SELECT string_agg('child.' || quote_ident(a.attname), ', ' ORDER BY k.ord)
                   FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
                   JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS childcols,
                (SELECT string_agg('parent.' || quote_ident(a.attname), ', ' ORDER BY k.ord)
                   FROM unnest(c.confkey) WITH ORDINALITY k(attnum, ord)
                   JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum) AS parentcols
         FROM pg_constraint c
         JOIN pg_namespace n ON n.oid = c.connamespace
         WHERE n.nspname = 'musicbrainz' AND c.contype = 'f'
       LOOP
         EXECUTE 'SELECT count(*) FROM ' || fk.child || ' child'
           || ' WHERE NOT (ROW(' || fk.childcols || ') IS NULL)'
           || ' AND NOT EXISTS (SELECT 1 FROM ' || fk.parent || ' parent'
           || ' WHERE ROW(' || fk.parentcols || ') = ROW(' || fk.childcols || '))'
           INTO orphans;
         IF orphans > 0 THEN RAISE WARNING '% orphans under %', orphans, fk.conname; bad := bad + 1; END IF;
       END LOOP;
       IF bad > 0 THEN RAISE EXCEPTION '% foreign keys with orphans', bad; END IF;
     END $$;`,
  ]);
  assert.equal(audit.stderr.includes('orphans'), false);
});

test('the partitions seeded directly show through their pull-invisible parents', async () => {
  const manifest = JSON.parse(await readFile(join(example, 'out', 'manifest.json'), 'utf8'));
  const expected =
    Number(manifest.rowCounts.artistReleaseGroupNonvaInMusicbrainz) +
    Number(manifest.rowCounts.artistReleaseGroupVaInMusicbrainz);

  const { stdout } = await psql('SELECT COUNT(*) FROM musicbrainz.artist_release_group');
  assert.equal(Number(stdout.trim()), expected);
});

test('a sample of the live check constraints, visibly respected', async () => {
  // non_loop_relationship: two foreign keys into one pool, kept unequal by row-number rules
  assert.equal(
    (await psql('SELECT COUNT(*) FROM musicbrainz.l_artist_artist WHERE entity0 = entity1')).stdout.trim(),
    '0',
  );
  // the ordered pair the audit caught overrunning its pool during the validation run
  assert.equal((await psql('SELECT COUNT(*) FROM musicbrainz.tag_relation WHERE tag1 >= tag2')).stdout.trim(), '0');
  // the alias search-hint contract: sort_name mirrors name, locale stays null
  assert.equal(
    (await psql('SELECT COUNT(*) FROM musicbrainz.artist_alias WHERE type = 2 AND sort_name <> name')).stdout.trim(),
    '0',
  );
  assert.equal((await psql('SELECT COUNT(*) FROM musicbrainz.artist WHERE edits_pending < 0')).stdout.trim(), '0');
});

test('the whole schema loaded logged, because the partitioned parents stay outside the module', async () => {
  // The inverse of the AdventureWorks assertion, and deliberate: artist_release references
  // release from outside the module, so SetUnlogged would fail with the documented 42P16.
  const { stdout } = await psql(`
    SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND c.relpersistence <> 'p' AND n.nspname = 'musicbrainz'
  `);
  assert.equal(stdout.trim(), '0');
});

test('the serial sequences are ready for the next insert', async () => {
  const { stdout } = await psql(
    "INSERT INTO musicbrainz.artist_type (name, gid) VALUES ('post-seed probe', gen_random_uuid()) RETURNING id",
  );
  assert.equal(stdout.trim().split('\n')[0], '6');
});

test('the cube column carried through the customType contract answers a cube query', async () => {
  const { stdout } = await psql('SELECT DISTINCT public.cube_dim(toc) FROM musicbrainz.medium_index');
  assert.equal(stdout.trim(), '6');
});
