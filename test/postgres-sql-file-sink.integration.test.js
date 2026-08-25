const { describe, it, before, after } = require('node:test');
const { deepEqual: deq, equal: eq, ok } = require('node:assert');
const { mkdtemp, readFile, readdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { TriggerHandling, createPostgresSqlFileSink, generate } = require('../lib');
const {
  connectionStringFor,
  executeConnectionString,
  executeFile,
  executeScript,
  moveStaged,
  queryValue,
  removeStaged,
  stageDirectory,
} = require('./lib/psql');
const { structuralParkRules } = require('./lib/park-rules');
const parkSchema = require('./lib/park-schema');

const SEED = 42;
const REFERENCE_DATE = new Date('2024-06-01T00:00:00.000Z');

const COUNTS = {
  parks: 3,
  pitches: 7,
  owners: 20,
  holidayHomes: 10,
  accessories: 8,
  lettings: 12,
  parkOwners: 5,
  staff: 9,
};

const TABLE_NAMES = {
  parks: 'parks',
  pitches: 'pitches',
  owners: 'owners',
  holidayHomes: 'holiday_homes',
  accessories: 'accessories',
  lettings: 'lettings',
  parkOwners: 'park_owners',
  staff: 'staff',
};

const LOCAL_DATABASE = 'drizzle_super_seed_load';
const REMOTE_DATABASE = 'drizzle_super_seed_remote';
const LOADER_ROLE = 'park_loader';
const LOADED = '/tmp/drizzle-super-seed-load';
const MOVED = '/tmp/drizzle-super-seed-moved';

const ddl = () => readFile(join(__dirname, 'lib', 'park-schema.sql'), 'utf8');

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

const numberedFiles = async (directory) => (await readdir(directory)).filter((file) => /^\d{3}_/.test(file)).sort();

const freshDatabase = async (database) => {
  await executeScript(`DROP DATABASE IF EXISTS ${database}`);
  await executeScript(`CREATE DATABASE ${database}`);
  await executeScript(await ddl(), { database });
};

const countsIn = async (database) => {
  const totals = {};
  for (const [tableKey, tableName] of Object.entries(TABLE_NAMES)) {
    totals[tableKey] = Number(await queryValue(`SELECT COUNT(*) FROM ${tableName}`, { database }));
  }
  return totals;
};

describe('postgres sql file sink', () => {
  after(async () => {
    await removeStaged(LOADED);
    await removeStaged(MOVED);
    await executeScript(`DROP DATABASE IF EXISTS ${LOCAL_DATABASE}`);
    await executeScript(`DROP DATABASE IF EXISTS ${REMOTE_DATABASE}`);
    await executeScript(`DROP ROLE IF EXISTS ${LOADER_ROLE}`).catch(() => {});
  });

  describe('the docker entrypoint shape', () => {
    let directory;
    let manifest;

    before(async () => {
      directory = await temporaryDirectory();
      await generateInto(directory);
      manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
      await freshDatabase(LOCAL_DATABASE);
      await stageDirectory(directory, LOADED);
      for (const file of await numberedFiles(directory)) {
        await executeFile(`${LOADED}/${file}`, { database: LOCAL_DATABASE });
      }
      await executeFile(`${LOADED}/900_finalise.sql`, { database: LOCAL_DATABASE });
    });

    after(async () => {
      await rm(directory, { recursive: true, force: true });
    });

    it('loads every row the manifest records, each file in its own psql session', async () => {
      deq(await countsIn(LOCAL_DATABASE), manifest.rowCounts);
      deq(manifest.rowCounts, COUNTS);
    });

    it('joins every foreign key', async () => {
      const orphans = await queryValue(
        `SELECT
           (SELECT COUNT(*) FROM pitches p LEFT JOIN parks k ON k.id = p.park_id WHERE k.id IS NULL)
         + (SELECT COUNT(*) FROM holiday_homes h LEFT JOIN owners o ON o.id = h.owner_id WHERE o.id IS NULL)
         + (SELECT COUNT(*) FROM lettings l LEFT JOIN holiday_homes h ON h.id = l.holiday_home_id WHERE h.id IS NULL)
         + (SELECT COUNT(*) FROM owners c LEFT JOIN owners p ON p.id = c.referred_by_owner_id
              WHERE c.referred_by_owner_id IS NOT NULL AND p.id IS NULL)`,
        { database: LOCAL_DATABASE },
      );

      eq(orphans, '0');
    });

    it('holds the unique and composite key constraints when they are counted again', async () => {
      const duplicates = await queryValue(
        `SELECT
           ((SELECT COUNT(*) FROM lettings) - (SELECT COUNT(DISTINCT (holiday_home_id, start_date)) FROM lettings))
         + ((SELECT COUNT(*) FROM owners) - (SELECT COUNT(DISTINCT email) FROM owners))
         + ((SELECT COUNT(*) FROM park_owners) - (SELECT COUNT(DISTINCT (park_id, owner_id)) FROM park_owners))`,
        { database: LOCAL_DATABASE },
      );

      eq(duplicates, '0');
    });

    it('holds every declared enum value', async () => {
      const unexpected = await queryValue(
        "SELECT COUNT(*) FROM lettings WHERE status NOT IN ('pending', 'confirmed', 'cancelled')",
        { database: LOCAL_DATABASE },
      );

      eq(unexpected, '0');
    });

    it('assigns every deferred foreign key a row which exists', async () => {
      const orphans = await queryValue(
        `SELECT COUNT(*) FROM parks p LEFT JOIN staff s ON s.id = p.warden_id
         WHERE p.warden_id IS NOT NULL AND s.id IS NULL`,
        { database: LOCAL_DATABASE },
      );
      const assigned = await queryValue('SELECT COUNT(*) FROM parks WHERE warden_id IS NOT NULL', {
        database: LOCAL_DATABASE,
      });

      eq(orphans, '0');
      ok(Number(assigned) > 0);
    });

    it('patches the rows with a single set based update', async () => {
      const deferred = await readFile(join(directory, '090_deferred_parks_warden_id.sql'), 'utf8');

      eq(deferred.split('UPDATE ').length - 1, 1);
      ok(deferred.includes('CREATE TEMP TABLE deferred_parks_warden_id ("id" integer, "warden_id" integer)'));
      ok(deferred.includes('FROM deferred_parks_warden_id d WHERE t."id" = d."id";'));
      ok(!deferred.includes('UPDATE "public"."parks" AS t SET "warden_id" = 1 '));
    });

    it('leaves every sequence ready for the next insert', async () => {
      const inserted = await queryValue(
        `WITH park AS (
           INSERT INTO parks (name, region, opened_at, active) VALUES ('New Park', 'wales', '2024-01-01', true)
           RETURNING id
         ), pitch AS (
           INSERT INTO pitches (park_id, reference) SELECT id, 'NEW1' FROM park RETURNING id
         ), home AS (
           INSERT INTO holiday_homes (pitch_id, owner_id, model)
           SELECT pitch.id, (SELECT id FROM owners LIMIT 1), 'New Model' FROM pitch RETURNING id
         ), accessory AS (
           INSERT INTO accessories (holiday_home_id, description) SELECT id, 'New Accessory' FROM home RETURNING id
         )
         SELECT (SELECT id FROM park) || ' ' || (SELECT id FROM pitch) || ' ' ||
                (SELECT id FROM home) || ' ' || (SELECT id FROM accessory)`,
        { database: LOCAL_DATABASE },
      );

      eq(inserted, [COUNTS.parks + 1, COUNTS.pitches + 1, COUNTS.holidayHomes + 1, COUNTS.accessories + 1].join(' '));
    });
  });

  describe('the remote orchestrator shape', () => {
    let directory;

    before(async () => {
      directory = await temporaryDirectory();
      await generateInto(directory);
      await freshDatabase(REMOTE_DATABASE);
      await removeStaged(MOVED);
      await stageDirectory(directory, LOADED);
    });

    after(async () => {
      await rm(directory, { recursive: true, force: true });
    });

    it('loads everything over tcp in a single psql invocation', async () => {
      await executeConnectionString(connectionStringFor('drizzle_super_seed', REMOTE_DATABASE), `${LOADED}/load.psql`);

      deq(await countsIn(REMOTE_DATABASE), COUNTS);
    });

    it('resolves its includes after the directory is moved', async () => {
      await freshDatabase(REMOTE_DATABASE);
      await moveStaged(LOADED, MOVED);

      await executeConnectionString(connectionStringFor('drizzle_super_seed', REMOTE_DATABASE), `${MOVED}/load.psql`);

      deq(await countsIn(REMOTE_DATABASE), COUNTS);
    });
  });

  describe('leaving the triggers enabled', () => {
    let directory;

    before(async () => {
      directory = await temporaryDirectory();
      await generateInto(directory, { triggerHandling: TriggerHandling.LeaveEnabled });
      await freshDatabase(REMOTE_DATABASE);
      await executeScript(`DROP ROLE IF EXISTS ${LOADER_ROLE}`).catch(() => {});
      await executeScript(`CREATE ROLE ${LOADER_ROLE} LOGIN PASSWORD '${LOADER_ROLE}'`);
      await executeScript(
        `GRANT USAGE ON SCHEMA public TO ${LOADER_ROLE};
         GRANT ALL ON ALL TABLES IN SCHEMA public TO ${LOADER_ROLE};
         GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${LOADER_ROLE};`,
        { database: REMOTE_DATABASE },
      );
      await stageDirectory(directory, LOADED);
    });

    after(async () => {
      await rm(directory, { recursive: true, force: true });
    });

    it('writes no file which touches the replication role', async () => {
      for (const file of await readdir(directory)) {
        ok(!(await readFile(join(directory, file), 'utf8')).includes('session_replication_role'), file);
      }
    });

    it('is a privilege the loading role does not have', async () => {
      eq(await queryValue(`SELECT rolsuper FROM pg_roles WHERE rolname = '${LOADER_ROLE}'`), 'f');
    });

    it('loads as that role with every constraint enforcing', async () => {
      await executeConnectionString(connectionStringFor(LOADER_ROLE, REMOTE_DATABASE), `${LOADED}/load.psql`);

      deq(await countsIn(REMOTE_DATABASE), COUNTS);
    });

    it('assigns the deferred foreign keys even with the constraints enforcing', async () => {
      const orphans = await queryValue(
        `SELECT COUNT(*) FROM parks p LEFT JOIN staff s ON s.id = p.warden_id
         WHERE p.warden_id IS NOT NULL AND s.id IS NULL`,
        { database: REMOTE_DATABASE },
      );
      const assigned = await queryValue('SELECT COUNT(*) FROM parks WHERE warden_id IS NOT NULL', {
        database: REMOTE_DATABASE,
      });

      eq(orphans, '0');
      ok(Number(assigned) > 0);
    });

    it('loads the self referencing table, every referrer after the row it refers to', async () => {
      const orphans = await queryValue(
        `SELECT COUNT(*) FROM owners c LEFT JOIN owners p ON p.id = c.referred_by_owner_id
         WHERE c.referred_by_owner_id IS NOT NULL AND p.id IS NULL`,
        { database: REMOTE_DATABASE },
      );
      const referrers = await queryValue('SELECT COUNT(*) FROM owners WHERE referred_by_owner_id IS NOT NULL', {
        database: REMOTE_DATABASE,
      });

      eq(orphans, '0');
      ok(Number(referrers) > 0);
    });
  });
});
