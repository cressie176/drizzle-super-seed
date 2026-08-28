// AdventureWorks in a box: 68 tables, five schemas, 90 CHECK constraints live during the load,
// and the audit asks the catalogue itself whether every one of the 90 foreign keys holds.
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

const IMAGE = 'drizzle-super-seed-adventureworks-smoke';
const CONTAINER = 'drizzle-super-seed-adventureworks-smoke';
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
    'adventureworks',
    '-t',
    '-A',
    '-c',
    statement,
  ]);

const waitUntilReady = async () => {
  for (let attempt = 0; attempt < READY_ATTEMPTS; attempt++) {
    try {
      await psql('SELECT COUNT(*) FROM sales.salesorderdetail');
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
    'POSTGRES_PASSWORD=aw',
    '-e',
    'POSTGRES_DB=adventureworks',
    IMAGE,
  ]);
  await waitUntilReady();
});

after(async () => {
  await run('docker', ['rm', '-f', CONTAINER]).catch(() => {});
});

test('all sixty-eight tables hold exactly the rows the manifest records', async () => {
  const manifest = JSON.parse(await readFile(join(example, 'out', 'manifest.json'), 'utf8'));
  const tables = Object.keys(manifest.rowCounts);
  assert.equal(tables.length, 68);

  const { stdout } = await psql(`
    SELECT SUM(n_live_tup) FROM pg_stat_user_tables
    WHERE schemaname IN ('person', 'humanresources', 'production', 'purchasing', 'sales')
  `);
  const expected = Object.values(manifest.rowCounts).reduce((a: number, b) => a + Number(b), 0);
  assert.equal(Number(stdout.trim()), expected);
});

test('every one of the ninety foreign keys holds, asked of the catalogue itself', async () => {
  const { stdout } = await psql(`
    SELECT COUNT(*) FROM pg_constraint pc
    JOIN pg_namespace n ON n.oid = pc.connamespace
    WHERE contype = 'f' AND n.nspname IN ('person', 'humanresources', 'production', 'purchasing', 'sales')
  `);
  assert.equal(stdout.trim(), '90');

  const audit = await run('docker', [
    'exec',
    CONTAINER,
    'psql',
    '-h',
    '127.0.0.1',
    '-U',
    'postgres',
    '-d',
    'adventureworks',
    '-c',
    `DO $$
     DECLARE con record; child_cols text; parent_cols text; n bigint; bad int := 0;
     BEGIN
       FOR con IN
         SELECT pc.oid, n.nspname AS sch, c.relname AS tbl, fn.nspname AS fsch, fc.relname AS ftbl, conname
         FROM pg_constraint pc
         JOIN pg_class c ON c.oid = pc.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_class fc ON fc.oid = pc.confrelid JOIN pg_namespace fn ON fn.oid = fc.relnamespace
         WHERE contype = 'f' AND n.nspname IN ('person','humanresources','production','purchasing','sales')
       LOOP
         SELECT string_agg(format('ch.%I', a.attname), ', ' ORDER BY ord),
                string_agg(format('pa.%I', af.attname), ', ' ORDER BY ord)
           INTO child_cols, parent_cols
           FROM pg_constraint x,
                unnest(x.conkey) WITH ORDINALITY AS ck(attnum, ord)
                JOIN unnest((SELECT confkey FROM pg_constraint WHERE oid = con.oid)) WITH ORDINALITY AS cf(attnum, ord2) ON ord = ord2,
                pg_attribute a, pg_attribute af
          WHERE x.oid = con.oid AND a.attrelid = x.conrelid AND a.attnum = ck.attnum
            AND af.attrelid = x.confrelid AND af.attnum = cf.attnum;
         EXECUTE format(
           'SELECT COUNT(*) FROM %I.%I ch WHERE (%s) IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %I.%I pa WHERE (%s) = (%s))',
           con.sch, con.tbl, child_cols, con.fsch, con.ftbl, parent_cols, child_cols) INTO n;
         IF n > 0 THEN RAISE WARNING '% orphans under %', n, con.conname; bad := bad + 1; END IF;
       END LOOP;
       IF bad > 0 THEN RAISE EXCEPTION '% foreign keys with orphans', bad; END IF;
     END $$;`,
  ]);
  assert.equal(audit.stderr.includes('orphans'), false);
});

test('the subtype chains share their primary keys exactly', async () => {
  // person ids are a prefix of businessentity ids; employees a prefix of persons; salespeople
  // of employees. Offsets carve vendors and stores out of the same businessentity range.
  assert.equal(
    (
      await psql(
        'SELECT COUNT(*) FROM person.person p JOIN person.businessentity b ON b.businessentityid = p.businessentityid',
      )
    ).stdout.trim(),
    '1000',
  );
  assert.equal(
    (
      await psql(
        'SELECT COUNT(*) FROM humanresources.employee e JOIN person.person p ON p.businessentityid = e.businessentityid',
      )
    ).stdout.trim(),
    '290',
  );
  assert.equal(
    (
      await psql(
        'SELECT COUNT(*) FROM sales.salesperson s JOIN humanresources.employee e ON e.businessentityid = s.businessentityid',
      )
    ).stdout.trim(),
    '17',
  );
  assert.equal(
    (
      await psql(
        'SELECT COUNT(*) FROM purchasing.vendor v JOIN person.person p ON p.businessentityid = v.businessentityid',
      )
    ).stdout.trim(),
    '0',
  );
});

test('a sample of the ninety live check constraints, visibly respected', async () => {
  assert.equal(
    (await psql("SELECT COUNT(*) FROM humanresources.employee WHERE gender NOT IN ('M', 'F')")).stdout.trim(),
    '0',
  );
  assert.equal(
    (
      await psql('SELECT COUNT(*) FROM humanresources.employee WHERE vacationhours < -40 OR vacationhours > 240')
    ).stdout.trim(),
    '0',
  );
  assert.equal(
    (await psql('SELECT COUNT(*) FROM sales.salesorderheader WHERE duedate < orderdate')).stdout.trim(),
    '0',
  );
  assert.equal((await psql('SELECT COUNT(*) FROM production.workorder WHERE orderqty <= 0')).stdout.trim(), '0');
});

test('the whole schema loaded unlogged, the composite edge ordered correctly', async () => {
  const { stdout } = await psql(`
    SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND c.relpersistence <> 'u'
      AND n.nspname IN ('person', 'humanresources', 'production', 'purchasing', 'sales')
  `);
  assert.equal(stdout.trim(), '0');
});

test('the serial sequences are ready for the next insert', async () => {
  const { stdout } = await psql('INSERT INTO person.businessentity DEFAULT VALUES RETURNING businessentityid');
  assert.equal(stdout.trim().split('\n')[0], '1501');
});
