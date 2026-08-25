const { describe, it, before, after } = require('node:test');
const { deepEqual: deq, equal: eq, ok, rejects } = require('node:assert');
const { and, eq: eqTo, sql } = require('drizzle-orm');
const { drizzle } = require('drizzle-orm/node-postgres');
const { createRowBatchSink, generate } = require('../lib');
const { connect, createParkSchema, dropParkSchema } = require('./lib/park-database');
const { structuralParkRules } = require('./lib/park-rules');
const parkSchema = require('./lib/park-schema');

const SEED = 42;
const REFERENCE_DATE = new Date('2024-06-01T00:00:00.000Z');

const COUNTS = {
  parks: 3,
  pitches: 8,
  owners: 25,
  holidayHomes: 12,
  accessories: 10,
  lettings: 15,
  parkOwners: 6,
  staff: 9,
};

const insertBuilder = (db, batch) => {
  const builder = db.insert(batch.table);
  return batch.overrideSystemValue ? builder.overridingSystemValue() : builder;
};

const insertBatch = (db) => (batch) => insertBuilder(db, batch).values(batch.rows);

const primaryKeyMatch = (table, primaryKey) =>
  and(...Object.entries(primaryKey).map(([property, value]) => eqTo(table[property], value)));

const applyDeferredUpdates = (db) => async (batch) => {
  for (const update of batch.updates) {
    await db.update(batch.table).set(update.values).where(primaryKeyMatch(batch.table, update.primaryKey));
  }
};

const countOf = async (client, table) => {
  const { rows } = await client.query(`SELECT COUNT(*)::int AS total FROM ${table}`);
  return rows[0].total;
};

describe('row batch sink', () => {
  let client;
  let db;

  before(async () => {
    client = await connect();
    db = drizzle({ client });
  });

  after(async () => {
    await dropParkSchema(client);
    await client.end();
  });

  describe('inserting through drizzle with constraints enabled', () => {
    let report;

    before(async () => {
      await dropParkSchema(client);
      await createParkSchema(client);
      report = await generate(
        {
          schema: parkSchema,
          rules: structuralParkRules,
          counts: COUNTS,
          seed: SEED,
          referenceDate: REFERENCE_DATE,
          batchSize: 4,
        },
        createRowBatchSink(insertBatch(db), applyDeferredUpdates(db)),
      );
    });

    it('inserts every row the report accounts for', async () => {
      deq(report.rowCounts, COUNTS);
      eq(await countOf(client, 'parks'), COUNTS.parks);
      eq(await countOf(client, 'holiday_homes'), COUNTS.holidayHomes);
      eq(await countOf(client, 'lettings'), COUNTS.lettings);
    });

    it('leaves no foreign key without a parent, as postgres was enforcing throughout', async () => {
      const { rows } = await client.query(`
        SELECT COUNT(*)::int AS orphans
        FROM holiday_homes h
        LEFT JOIN pitches p ON p.id = h.pitch_id
        LEFT JOIN owners o ON o.id = h.owner_id
        WHERE p.id IS NULL OR o.id IS NULL
      `);

      eq(rows[0].orphans, 0);
    });

    it('inserts explicit values into a generated always identity column', async () => {
      const { rows } = await client.query('SELECT id FROM parks ORDER BY id');

      deq(
        rows.map((row) => row.id),
        [1, 2, 3],
      );
    });

    it('refers owners only to owners already inserted', async () => {
      const { rows } = await client.query(`
        SELECT COUNT(*)::int AS orphans
        FROM owners child
        LEFT JOIN owners parent ON parent.id = child.referred_by_owner_id
        WHERE child.referred_by_owner_id IS NOT NULL AND parent.id IS NULL
      `);

      eq(rows[0].orphans, 0);
    });

    it('applies the deferred updates through drizzle, with the constraint enforcing', async () => {
      const { rows } = await client.query(`
        SELECT
          (SELECT COUNT(*)::int FROM parks WHERE warden_id IS NOT NULL) AS assigned,
          (SELECT COUNT(*)::int FROM parks p LEFT JOIN staff s ON s.id = p.warden_id
             WHERE p.warden_id IS NOT NULL AND s.id IS NULL) AS orphans
      `);

      ok(rows[0].assigned > 0);
      eq(rows[0].orphans, 0);
    });

    it('confirms the constraints were enabled for the whole load', async () => {
      const { rows } = await client.query(`
        SELECT COUNT(*)::int AS enforced
        FROM pg_constraint
        WHERE contype = 'f' AND conrelid = 'holiday_homes'::regclass AND convalidated
      `);

      ok(rows[0].enforced >= 2);
    });
  });

  describe('a handler which fails part way', () => {
    before(async () => {
      await dropParkSchema(client);
      await createParkSchema(client);
    });

    it('leaves the rows the handler already inserted, and inserts no more', async () => {
      const failure = new Error('the handler gave up');

      await rejects(
        generate(
          {
            schema: parkSchema,
            rules: structuralParkRules,
            counts: { parks: 3, pitches: 4 },
            seed: SEED,
            referenceDate: REFERENCE_DATE,
          },
          createRowBatchSink(async (batch) => {
            if (batch.tableKey === 'pitches') throw failure;
            await insertBatch(db)(batch);
          }),
        ),
        (error) => error === failure,
      );

      eq(await countOf(client, 'parks'), 3);
      eq(await countOf(client, 'pitches'), 0);
    });

    it('leaves the transaction strategy to the handler', async () => {
      await db.execute(sql.raw('TRUNCATE parks, pitches CASCADE'));
      const failure = new Error('rolled back');

      await rejects(
        db.transaction(async (transaction) =>
          generate(
            {
              schema: parkSchema,
              rules: structuralParkRules,
              counts: { parks: 3, pitches: 4 },
              seed: SEED,
              referenceDate: REFERENCE_DATE,
            },
            createRowBatchSink(async (batch) => {
              if (batch.tableKey === 'pitches') throw failure;
              await insertBuilder(transaction, batch).values(batch.rows);
            }),
          ),
        ),
        (error) => error === failure,
      );

      eq(await countOf(client, 'parks'), 0);
    });
  });
});
