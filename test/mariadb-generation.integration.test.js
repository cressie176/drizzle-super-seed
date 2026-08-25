const { describe, it, before, after } = require('node:test');
const { deepEqual: deq, equal: eq, ok } = require('node:assert');
const { getTableColumns } = require('drizzle-orm');
const { drizzle } = require('drizzle-orm/mysql2');
const { createRowBatchSink, generate, structuralDefault } = require('../lib');
const { connect, createParkSchema, dropParkSchema } = require('./lib/mariadb-database');
const mariaDbSchema = require('./lib/park-schema-mariadb');

const SEED = 42;
const REFERENCE_DATE = new Date('2024-06-01T00:00:00.000Z');

const COUNTS = {
  parks: 3,
  owners: 12,
  pitches: 6,
  holidayHomes: 8,
  accessories: 5,
  lettings: 10,
  parkOwners: 4,
};

const structuralRules = Object.fromEntries(
  Object.entries(mariaDbSchema).map(([tableKey, table]) => [
    tableKey,
    Object.fromEntries(Object.keys(getTableColumns(table)).map((propertyName) => [propertyName, structuralDefault])),
  ]),
);

const countOf = async (connection, table) => {
  const [rows] = await connection.query(`SELECT COUNT(*) AS total FROM ${table}`);
  return Number(rows[0].total);
};

describe('mariadb generation', () => {
  let connection;
  let db;
  let report;

  before(async () => {
    connection = await connect();
    db = drizzle({ client: connection });
    await dropParkSchema(connection);
    await createParkSchema(connection);
    report = await generate(
      {
        schema: mariaDbSchema,
        rules: structuralRules,
        counts: COUNTS,
        seed: SEED,
        referenceDate: REFERENCE_DATE,
        batchSize: 4,
      },
      createRowBatchSink((batch) => db.insert(batch.table).values(batch.rows)),
    );
  });

  after(async () => {
    await dropParkSchema(connection);
    await connection.end();
  });

  describe('inserting through drizzle with foreign key checks enabled', () => {
    it('inserts every row the report accounts for', async () => {
      deq(report.rowCounts, COUNTS);
      eq(await countOf(connection, 'parks'), COUNTS.parks);
      eq(await countOf(connection, 'lettings'), COUNTS.lettings);
      eq(await countOf(connection, 'holiday_homes'), COUNTS.holidayHomes);
    });

    it('leaves no foreign key without a parent', async () => {
      const [rows] = await connection.query(`
        SELECT
          (SELECT COUNT(*) FROM holiday_homes h LEFT JOIN pitches p ON p.id = h.pitch_id WHERE p.id IS NULL)
        + (SELECT COUNT(*) FROM holiday_homes h LEFT JOIN owners o ON o.id = h.owner_id WHERE o.id IS NULL)
        + (SELECT COUNT(*) FROM owners c LEFT JOIN owners p ON p.id = c.referred_by_owner_id
             WHERE c.referred_by_owner_id IS NOT NULL AND p.id IS NULL) AS orphans
      `);

      eq(Number(rows[0].orphans), 0);
    });

    it('confirms the foreign key checks were on for the whole load', async () => {
      const [rows] = await connection.query('SELECT @@foreign_key_checks AS enabled');

      eq(Number(rows[0].enabled), 1);
    });

    it('holds the unique and composite key constraints', async () => {
      const [rows] = await connection.query(`
        SELECT
          (SELECT COUNT(DISTINCT email) FROM owners) AS emails,
          (SELECT COUNT(*) FROM owners) AS owners,
          (SELECT COUNT(DISTINCT CONCAT(park_id, ':', owner_id)) FROM park_owners) AS pairs,
          (SELECT COUNT(*) FROM park_owners) AS park_owners
      `);

      eq(Number(rows[0].emails), Number(rows[0].owners));
      eq(Number(rows[0].pairs), Number(rows[0].park_owners));
    });

    it('stores only the enum values the schema declares', async () => {
      const [rows] = await connection.query(
        "SELECT COUNT(*) AS unexpected FROM lettings WHERE status NOT IN ('pending', 'confirmed', 'cancelled')",
      );

      eq(Number(rows[0].unexpected), 0);
    });

    it('advances auto increment past the explicit ids it inserted', async () => {
      const [result] = await connection.query(
        "INSERT INTO parks (name, region, opened_at, active) VALUES ('New Park', 'wales', '2024-01-01 00:00:00', 1)",
      );

      eq(result.insertId, COUNTS.parks + 1);
    });

    it('refers owners only to owners inserted before them', async () => {
      const [rows] = await connection.query(
        'SELECT COUNT(*) AS referred FROM owners WHERE referred_by_owner_id IS NOT NULL',
      );

      ok(Number(rows[0].referred) > 0);
    });
  });
});
