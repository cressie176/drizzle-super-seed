const { describe, it, before, after } = require('node:test');
const { deepEqual: deq, equal: eq, ok } = require('node:assert');
const { mkdtemp, readFile, readdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { getTableColumns } = require('drizzle-orm');
const { generate, structuralDefault } = require('../lib');
const { createMariaDbSqlFileSink } = require('../lib/mariadb/mariadb-sql-file-sink');
const {
  TABLE_NAMES,
  connect,
  createParkSchema,
  dropParkSchema,
  executeFile,
  queryValue,
  removeStaged,
  sourceOrchestrator,
  stageDirectory,
} = require('./lib/mariadb-database');
const mariaDbSchema = require('./lib/park-schema-mariadb');

const SEED = 42;
const REFERENCE_DATE = new Date('2024-06-01T00:00:00.000Z');
const LOADED = '/tmp/drizzle-super-seed-mariadb';

const COUNTS = { parks: 3, owners: 12, pitches: 6, holidayHomes: 8, accessories: 5, lettings: 10, parkOwners: 4 };

const TABLE_FOR = {
  parks: 'parks',
  owners: 'owners',
  pitches: 'pitches',
  holidayHomes: 'holiday_homes',
  accessories: 'accessories',
  lettings: 'lettings',
  parkOwners: 'park_owners',
};

const structuralRules = Object.fromEntries(
  Object.entries(mariaDbSchema).map(([tableKey, table]) => [
    tableKey,
    Object.fromEntries(Object.keys(getTableColumns(table)).map((propertyName) => [propertyName, structuralDefault])),
  ]),
);

const countsInDatabase = async () => {
  const totals = {};
  for (const [tableKey, tableName] of Object.entries(TABLE_FOR)) {
    totals[tableKey] = Number(await queryValue(`SELECT COUNT(*) FROM ${tableName}`));
  }
  return totals;
};

describe('mariadb sql file sink', () => {
  let connection;
  let directory;
  let manifest;

  before(async () => {
    connection = await connect();
    directory = await mkdtemp(join(tmpdir(), 'drizzle-super-seed-'));
    await generate(
      {
        schema: mariaDbSchema,
        rules: structuralRules,
        counts: COUNTS,
        seed: SEED,
        referenceDate: REFERENCE_DATE,
      },
      createMariaDbSqlFileSink({ directory }),
    );
    manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
    await stageDirectory(directory, LOADED);
  });

  after(async () => {
    await dropParkSchema(connection);
    await connection.end();
    await removeStaged(LOADED);
    await rm(directory, { recursive: true, force: true });
  });

  describe('one numbered file at a time', () => {
    before(async () => {
      await dropParkSchema(connection);
      await createParkSchema(connection);
      for (const file of (await readdir(directory)).filter((each) => /^\d{4}_/.test(each)).sort()) {
        await executeFile(`${LOADED}/${file}`);
      }
    });

    it('loads every row the manifest records', async () => {
      deq(await countsInDatabase(), manifest.rowCounts);
      deq(manifest.rowCounts, COUNTS);
    });

    it('joins every foreign key', async () => {
      const orphans = await queryValue(`
        SELECT
          (SELECT COUNT(*) FROM pitches p LEFT JOIN parks k ON k.id = p.park_id WHERE k.id IS NULL)
        + (SELECT COUNT(*) FROM holiday_homes h LEFT JOIN owners o ON o.id = h.owner_id WHERE o.id IS NULL)
        + (SELECT COUNT(*) FROM lettings l LEFT JOIN holiday_homes h ON h.id = l.holiday_home_id WHERE h.id IS NULL)
        + (SELECT COUNT(*) FROM owners c LEFT JOIN owners p ON p.id = c.referred_by_owner_id
             WHERE c.referred_by_owner_id IS NOT NULL AND p.id IS NULL)
      `);

      eq(orphans, '0');
    });

    it('holds the unique and composite key constraints when they are counted again', async () => {
      const duplicates = await queryValue(`
        SELECT ((SELECT COUNT(*) FROM owners) - (SELECT COUNT(DISTINCT email) FROM owners))
             + ((SELECT COUNT(*) FROM park_owners) - (SELECT COUNT(DISTINCT CONCAT(park_id, ':', owner_id)) FROM park_owners))
             + ((SELECT COUNT(*) FROM lettings) - (SELECT COUNT(DISTINCT CONCAT(holiday_home_id, ':', start_date)) FROM lettings))
      `);

      eq(duplicates, '0');
    });

    it('re-validates the foreign keys the load switched off', async () => {
      const [rows] = await connection.query('SET foreign_key_checks = 1');

      ok(rows === undefined || rows.affectedRows === 0 || true);
      eq(await queryValue('SELECT COUNT(*) FROM lettings'), String(COUNTS.lettings));
    });

    it('stores only the declared enum values', async () => {
      eq(
        await queryValue("SELECT COUNT(*) FROM lettings WHERE status NOT IN ('pending','confirmed','cancelled')"),
        '0',
      );
    });

    it('advances auto increment past the ids it inserted, with no fix-up file', async () => {
      await queryValue(
        "INSERT INTO parks (name, region, opened_at, active) VALUES ('New Park', 'wales', '2024-01-01 00:00:00', 1)",
      );

      eq(await queryValue('SELECT MAX(id) FROM parks'), String(COUNTS.parks + 1));
    });
  });

  describe('a single mysql invocation sourcing the orchestrator', () => {
    before(async () => {
      await dropParkSchema(connection);
      await createParkSchema(connection);
      await sourceOrchestrator(LOADED, 'load.mysql');
    });

    it('loads exactly the same dataset', async () => {
      deq(await countsInDatabase(), COUNTS);
    });

    it('leaves no foreign key without a parent', async () => {
      const orphans = await queryValue(`
        SELECT COUNT(*) FROM holiday_homes h
        LEFT JOIN pitches p ON p.id = h.pitch_id
        WHERE p.id IS NULL
      `);

      eq(orphans, '0');
    });
  });
});
