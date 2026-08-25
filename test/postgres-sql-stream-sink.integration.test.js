const { describe, it, before, after } = require('node:test');
const { deepEqual: deq, equal: eq, ok } = require('node:assert');
const { once } = require('node:events');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { createPostgresSqlStreamSink, generate } = require('../lib');
const { executeScript, queryValue, spawnPsql } = require('./lib/container-psql');
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
};

const TABLE_NAMES = {
  parks: 'parks',
  pitches: 'pitches',
  owners: 'owners',
  holidayHomes: 'holiday_homes',
  accessories: 'accessories',
  lettings: 'lettings',
  parkOwners: 'park_owners',
};

const STREAMED_DATABASE = 'drizzle_super_seed_streamed';

const ddl = () => readFile(join(__dirname, 'lib', 'park-schema.sql'), 'utf8');

const countsIn = async (database) => {
  const totals = {};
  for (const [tableKey, tableName] of Object.entries(TABLE_NAMES)) {
    totals[tableKey] = Number(await queryValue(`SELECT COUNT(*) FROM ${tableName}`, { database }));
  }
  return totals;
};

describe('postgres sql stream sink', () => {
  let psql;
  let stderr;
  let report;
  let endedBeforeGenerateResolved;

  before(async () => {
    await executeScript(`DROP DATABASE IF EXISTS ${STREAMED_DATABASE}`);
    await executeScript(`CREATE DATABASE ${STREAMED_DATABASE}`);
    await executeScript(await ddl(), { database: STREAMED_DATABASE });

    psql = spawnPsql({ database: STREAMED_DATABASE });
    stderr = [];
    psql.stderr.on('data', (chunk) => stderr.push(chunk.toString()));
    psql.stdout.resume();

    report = await generate(
      {
        schema: parkSchema,
        rules: structuralParkRules,
        counts: COUNTS,
        seed: SEED,
        referenceDate: REFERENCE_DATE,
        batchSize: 4,
      },
      createPostgresSqlStreamSink({ writable: psql.stdin }),
    );

    endedBeforeGenerateResolved = psql.stdin.writableEnded;
    psql.stdin.end();
    await once(psql, 'close');
  });

  after(async () => {
    await executeScript(`DROP DATABASE IF EXISTS ${STREAMED_DATABASE}`);
  });

  describe('piped straight into psql', () => {
    it('loads without psql reporting an error', () => {
      eq(psql.exitCode, 0, stderr.join(''));
    });

    it('loads exactly what the report accounts for', async () => {
      deq(await countsIn(STREAMED_DATABASE), COUNTS);
      deq(report.rowCounts, COUNTS);
    });

    it('leaves the stream open for the caller to end', () => {
      eq(endedBeforeGenerateResolved, false);
    });

    it('joins every foreign key it loaded', async () => {
      const orphans = await queryValue(
        `SELECT
           (SELECT COUNT(*) FROM pitches p LEFT JOIN parks k ON k.id = p.park_id WHERE k.id IS NULL)
         + (SELECT COUNT(*) FROM holiday_homes h LEFT JOIN owners o ON o.id = h.owner_id WHERE o.id IS NULL)
         + (SELECT COUNT(*) FROM owners c LEFT JOIN owners p ON p.id = c.referred_by_owner_id
              WHERE c.referred_by_owner_id IS NOT NULL AND p.id IS NULL)`,
        { database: STREAMED_DATABASE },
      );

      eq(orphans, '0');
    });

    it('leaves the sequences ready, because the finalise block was streamed too', async () => {
      const next = await queryValue(
        `INSERT INTO parks (name, region, opened_at, active)
         VALUES ('Streamed Park', 'wales', '2024-01-01', true) RETURNING id`,
        { database: STREAMED_DATABASE },
      );

      eq(next, String(COUNTS.parks + 1));
    });

    it('reports the same counts as the directory sink would', async () => {
      ok(Object.values(report.rowCounts).every((count) => count > 0));
    });
  });
});
