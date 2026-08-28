const { describe, it, before, after } = require('node:test');
const { deepEqual: deq, equal: eq, match, ok, rejects } = require('node:assert');
const { mkdtemp, readFile, readdir, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { TriggerHandling, createPostgresSqlFileSink, generate } = require('../lib');
const { structuralParkRules } = require('./lib/park-rules');
const parkSchema = require('./lib/park-schema');

const SEED = 42;
const REFERENCE_DATE = new Date('2024-06-01T00:00:00.000Z');

const COUNTS = {
  parks: 2,
  pitches: 3,
  owners: 4,
  holidayHomes: 2,
  accessories: 2,
  lettings: 2,
  parkOwners: 2,
  staff: 3,
};

const NUMBERED = [
  'seed-0010_owners.sql',
  'seed-0020_parks.sql',
  'seed-0030_pitches.sql',
  'seed-0040_holidayHomes.sql',
  'seed-0050_accessories.sql',
  'seed-0060_lettings.sql',
  'seed-0070_parkOwners.sql',
  'seed-0080_staff.sql',
  'seed-0090_deferred_parks_warden_id.sql',
];

const temporaryDirectory = () => mkdtemp(join(tmpdir(), 'drizzle-super-seed-'));

const generateInto = (directory, overrides = {}) =>
  generate(
    {
      schema: parkSchema,
      rules: structuralParkRules,
      counts: COUNTS,
      seed: SEED,
      referenceDate: REFERENCE_DATE,
      ...overrides,
    },
    createPostgresSqlFileSink({ directory, triggerHandling: overrides.triggerHandling }),
  );

const read = (directory, file) => readFile(join(directory, file), 'utf8');

describe('postgres sql file sink', () => {
  let directory;
  let report;

  before(async () => {
    directory = await temporaryDirectory();
    report = await generateInto(directory);
  });

  after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  describe('the files it writes', () => {
    it('writes one numbered file per table, a finalise file, an orchestrator and a manifest', async () => {
      deq((await readdir(directory)).sort(), [
        'load.psql',
        'manifest.json',
        'seed-0000_set_unlogged.sql',
        ...NUMBERED,
        'seed-9990_finalise.sql',
      ]);
    });

    it('numbers the files so lexical order is dependency order', async () => {
      const numbered = (await readdir(directory)).filter((file) => /^seed-\d{4}_/.test(file)).sort();

      deq(
        numbered.slice(1, -2).map((file) => file.replace(/^seed-\d{4}_|\.sql$/g, '')),
        ['owners', 'parks', 'pitches', 'holidayHomes', 'accessories', 'lettings', 'parkOwners', 'staff'],
      );
      deq(numbered[0], 'seed-0000_set_unlogged.sql');
    });

    // Any one of these may be loaded on its own, or piped into psql, where psql's default is to
    // report a failed statement, run the rest and exit 0. The guard has to be in the file itself,
    // not only in the orchestrator, or a lost COPY reports success to the shell.
    it('stops on the first error in every file it writes, not only through the orchestrator', async () => {
      const written = (await readdir(directory)).filter((file) => file.endsWith('.sql'));

      ok(written.length > 1);
      for (const file of written) {
        ok((await read(directory, file)).startsWith('\\set ON_ERROR_STOP on\n'), `${file} is unguarded`);
      }
    });

    it('makes each table file self contained', async () => {
      const parks = await read(directory, 'seed-0020_parks.sql');

      ok(
        parks.startsWith(
          '\\set ON_ERROR_STOP on\nBEGIN;\nSET session_replication_role = replica;\nCOPY "public"."parks" (',
        ),
      );
      ok(parks.includes(') FROM stdin;\n'));
      ok(parks.endsWith('\\.\nCOMMIT;\n'));
    });

    it('names the columns as the database names them, quoted', async () => {
      const parks = await read(directory, 'seed-0020_parks.sql');

      ok(
        parks.includes(
          'COPY "public"."parks" ("id", "name", "region", "opened_at", "latitude", "amenities", "facilities", "active", "created_at", "warden_id") FROM stdin;',
        ),
      );
    });

    it('writes one tab separated line per row', async () => {
      const lines = (await read(directory, 'seed-0020_parks.sql')).split('\n');
      const firstRow = lines.findIndex((line) => line.endsWith('FROM stdin;')) + 1;
      const rows = lines.slice(firstRow, firstRow + COUNTS.parks);

      eq(rows.length, 2);
      for (const row of rows) eq(row.split('\t').length, 10);
    });

    it('writes an empty copy block for a table counted at zero', async () => {
      const empty = await temporaryDirectory();
      await generateInto(empty, { counts: { parks: 0 } });

      eq(await read(empty, 'seed-0010_parks.sql'), await emptyParksBlock());
      await rm(empty, { recursive: true, force: true });
    });

    const emptyParksBlock = async () => {
      const parks = await read(directory, 'seed-0020_parks.sql');
      const header = parks.split(') FROM stdin;\n')[0];
      return `${header}) FROM stdin;\n\\.\nCOMMIT;\n`;
    };
  });

  describe('the orchestrator', () => {
    it('stops on the first error and includes every numbered file once, in order', async () => {
      eq(
        await read(directory, 'load.psql'),
        [
          '\\set ON_ERROR_STOP on',
          ...['seed-0000_set_unlogged.sql', ...NUMBERED, 'seed-9990_finalise.sql'].map((file) => `\\ir ${file}`),
          '',
        ].join('\n'),
      );
    });

    it('carries the psql extension, so the docker entrypoint does not glob it', async () => {
      ok((await readdir(directory)).includes('load.psql'));
      ok(!(await readdir(directory)).includes('load.sql'));
    });
  });

  describe('the finalise file', () => {
    it('sets one sequence per sequence owned column', async () => {
      const finalise = await read(directory, 'seed-9990_finalise.sql');

      ok(finalise.includes(`SELECT setval(pg_get_serial_sequence('"public"."parks"', 'id'),`));
      ok(finalise.includes(`SELECT setval(pg_get_serial_sequence('"public"."pitches"', 'id'),`));
      ok(finalise.includes(`SELECT setval(pg_get_serial_sequence('"public"."holiday_homes"', 'id'),`));
      ok(finalise.includes(`SELECT setval(pg_get_serial_sequence('"public"."lettings"', 'id'),`));
      ok(finalise.includes(`SELECT setval(pg_get_serial_sequence('"public"."accessories"', 'id'),`));
    });

    it('sets no sequence for a uuid key or a composite key', async () => {
      const finalise = await read(directory, 'seed-9990_finalise.sql');

      ok(!finalise.includes('"public"."owners"'));
      ok(!finalise.includes('"public"."park_owners"'));
    });

    it('analyses after committing', async () => {
      ok((await read(directory, 'seed-9990_finalise.sql')).endsWith('COMMIT;\nANALYZE;\n'));
    });

    it('is written even when nothing owns a sequence', async () => {
      const uuidOnly = await temporaryDirectory();
      await generateInto(uuidOnly, { counts: { owners: 2 } });

      eq(await read(uuidOnly, 'seed-9990_finalise.sql'), '\\set ON_ERROR_STOP on\nBEGIN;\nCOMMIT;\nANALYZE;\n');
      await rm(uuidOnly, { recursive: true, force: true });
    });
  });

  describe('the manifest', () => {
    it('records the seed, the reference date, the counts and the trigger handling', async () => {
      const manifest = JSON.parse(await read(directory, 'manifest.json'));

      eq(manifest.seed, SEED);
      eq(manifest.referenceDate, REFERENCE_DATE.toISOString());
      deq(manifest.rowCounts, COUNTS);
      eq(manifest.triggerHandling, TriggerHandling.DisableDuringLoad);
      eq(typeof manifest.durationMs, 'number');
      match(manifest.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
    });

    it('lists every file the orchestrator loads', async () => {
      const manifest = JSON.parse(await read(directory, 'manifest.json'));
      const included = (await read(directory, 'load.psql'))
        .split('\n')
        .filter((line) => line.startsWith('\\ir '))
        .map((line) => line.slice('\\ir '.length));

      deq(manifest.files, included);
    });

    it('reports the same counts as the generation report', async () => {
      const manifest = JSON.parse(await read(directory, 'manifest.json'));

      deq(manifest.rowCounts, report.rowCounts);
    });
  });

  describe('trigger handling', () => {
    it('leaves the replication role alone when asked to', async () => {
      const enabled = await temporaryDirectory();
      await generateInto(enabled, { triggerHandling: TriggerHandling.LeaveEnabled });

      for (const file of await readdir(enabled)) {
        ok(!(await read(enabled, file)).includes('session_replication_role'), `${file} disables triggers`);
      }
      eq(JSON.parse(await read(enabled, 'manifest.json')).triggerHandling, TriggerHandling.LeaveEnabled);
      await rm(enabled, { recursive: true, force: true });
    });
  });

  describe('the output directory', () => {
    it('creates the directory when it does not exist', async () => {
      const parent = await temporaryDirectory();
      const nested = join(parent, 'generated', 'sql');
      await generateInto(nested, { counts: { parks: 1 } });

      ok((await readdir(nested)).includes('seed-0010_parks.sql'));
      await rm(parent, { recursive: true, force: true });
    });

    it('refuses to write into a directory which already holds something', async () => {
      const occupied = await temporaryDirectory();
      await writeFile(join(occupied, 'stale.sql'), 'COPY nothing FROM stdin;\n');

      await rejects(generateInto(occupied, { counts: { parks: 1 } }), {
        name: 'OutputDirectoryNotEmptyError',
        directory: occupied,
        entries: ['stale.sql'],
      });

      deq(await readdir(occupied), ['stale.sql']);
      await rm(occupied, { recursive: true, force: true });
    });
  });

  describe('reproducibility', () => {
    it('writes byte identical files for the same seed and reference date', async () => {
      const again = await temporaryDirectory();
      await generateInto(again);

      for (const file of (await readdir(directory)).filter((each) => each.endsWith('.sql'))) {
        eq(await read(again, file), await read(directory, file), `${file} differs`);
      }
      eq(await read(again, 'load.psql'), await read(directory, 'load.psql'));
      await rm(again, { recursive: true, force: true });
    });

    it('reproduces the run from the seed the manifest records', async () => {
      const invented = await temporaryDirectory();
      const replayed = await temporaryDirectory();
      await generateInto(invented, { seed: undefined });
      const manifest = JSON.parse(await read(invented, 'manifest.json'));
      await generateInto(replayed, { seed: manifest.seed, referenceDate: new Date(manifest.referenceDate) });

      eq(await read(replayed, 'seed-0020_parks.sql'), await read(invented, 'seed-0020_parks.sql'));
      await rm(invented, { recursive: true, force: true });
      await rm(replayed, { recursive: true, force: true });
    });
  });
});
