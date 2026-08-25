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

const COUNTS = { parks: 2, pitches: 3, owners: 4, holidayHomes: 2, accessories: 2, lettings: 2, parkOwners: 2 };

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
        '010_parks.sql',
        '020_pitches.sql',
        '030_owners.sql',
        '040_holidayHomes.sql',
        '050_accessories.sql',
        '060_lettings.sql',
        '070_parkOwners.sql',
        '900_finalise.sql',
        'load.psql',
        'manifest.json',
      ]);
    });

    it('numbers the files so lexical order is dependency order', async () => {
      const numbered = (await readdir(directory)).filter((file) => /^\d{3}_/.test(file)).sort();

      deq(
        numbered.slice(0, -1).map((file) => file.replace(/^\d{3}_|\.sql$/g, '')),
        ['parks', 'pitches', 'owners', 'holidayHomes', 'accessories', 'lettings', 'parkOwners'],
      );
    });

    it('makes each table file self contained', async () => {
      const parks = await read(directory, '010_parks.sql');

      ok(parks.startsWith('BEGIN;\nSET session_replication_role = replica;\nCOPY "public"."parks" ('));
      ok(parks.includes(') FROM stdin;\n'));
      ok(parks.endsWith('\\.\nCOMMIT;\n'));
    });

    it('names the columns as the database names them, quoted', async () => {
      const parks = await read(directory, '010_parks.sql');

      ok(
        parks.includes(
          'COPY "public"."parks" ("id", "name", "region", "opened_at", "latitude", "amenities", "active", "created_at") FROM stdin;',
        ),
      );
    });

    it('writes one tab separated line per row', async () => {
      const lines = (await read(directory, '010_parks.sql')).split('\n');
      const rows = lines.slice(3, 3 + COUNTS.parks);

      eq(rows.length, 2);
      for (const row of rows) eq(row.split('\t').length, 8);
    });

    it('writes an empty copy block for a table counted at zero', async () => {
      const empty = await temporaryDirectory();
      await generateInto(empty, { counts: { parks: 0 } });

      eq(await read(empty, '010_parks.sql'), await emptyParksBlock());
      await rm(empty, { recursive: true, force: true });
    });

    const emptyParksBlock = async () => {
      const parks = await read(directory, '010_parks.sql');
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
          '\\ir 010_parks.sql',
          '\\ir 020_pitches.sql',
          '\\ir 030_owners.sql',
          '\\ir 040_holidayHomes.sql',
          '\\ir 050_accessories.sql',
          '\\ir 060_lettings.sql',
          '\\ir 070_parkOwners.sql',
          '\\ir 900_finalise.sql',
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
      const finalise = await read(directory, '900_finalise.sql');

      ok(finalise.includes(`SELECT setval(pg_get_serial_sequence('"public"."parks"', 'id'),`));
      ok(finalise.includes(`SELECT setval(pg_get_serial_sequence('"public"."pitches"', 'id'),`));
      ok(finalise.includes(`SELECT setval(pg_get_serial_sequence('"public"."holiday_homes"', 'id'),`));
      ok(finalise.includes(`SELECT setval(pg_get_serial_sequence('"public"."lettings"', 'id'),`));
      ok(finalise.includes(`SELECT setval(pg_get_serial_sequence('"public"."accessories"', 'id'),`));
    });

    it('sets no sequence for a uuid key or a composite key', async () => {
      const finalise = await read(directory, '900_finalise.sql');

      ok(!finalise.includes('"public"."owners"'));
      ok(!finalise.includes('"public"."park_owners"'));
    });

    it('analyses after committing', async () => {
      ok((await read(directory, '900_finalise.sql')).endsWith('COMMIT;\nANALYZE;\n'));
    });

    it('is written even when nothing owns a sequence', async () => {
      const uuidOnly = await temporaryDirectory();
      await generateInto(uuidOnly, { counts: { owners: 2 } });

      eq(await read(uuidOnly, '900_finalise.sql'), 'BEGIN;\nCOMMIT;\nANALYZE;\n');
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

      ok((await readdir(nested)).includes('010_parks.sql'));
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

      eq(await read(replayed, '010_parks.sql'), await read(invented, '010_parks.sql'));
      await rm(invented, { recursive: true, force: true });
      await rm(replayed, { recursive: true, force: true });
    });
  });
});
