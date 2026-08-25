const { describe, it, before, after } = require('node:test');
const { deepEqual: deq, equal: eq, ok } = require('node:assert');
const { asc } = require('drizzle-orm');
const { drizzle } = require('drizzle-orm/node-postgres');
const { generate } = require('../lib');
const { connect, createParkSchema, dropParkSchema } = require('./lib/park-database');
const { structuralParkRules } = require('./lib/park-rules');
const parkSchema = require('./lib/park-schema');

const SEED = 42;
const REFERENCE_DATE = new Date('2024-06-01T00:00:00.000Z');

const COUNTS = {
  parks: 3,
  pitches: 8,
  owners: 20,
  holidayHomes: 12,
  accessories: 15,
  lettings: 10,
  parkOwners: 5,
};

const overridesSystemValue = (table) => table.columns.some((column) => column.identityAlways);

const insertBuilder = (db, table) => {
  const builder = db.insert(table.drizzleTable);
  return overridesSystemValue(table) ? builder.overridingSystemValue() : builder;
};

const insertion = (db, table, rows) => insertBuilder(db, table).values(rows);

const createInsertingSink = (db) => ({
  writeRows: (table, rows) => insertion(db, table, rows),
  end: (report) => report,
});

describe('generation engine', () => {
  let client;
  let db;
  let report;

  before(async () => {
    client = await connect();
    db = drizzle({ client });
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
      createInsertingSink(db),
    );
  });

  after(async () => {
    await dropParkSchema(client);
    await client.end();
  });

  describe('inserting into postgres', () => {
    it('inserts every row it reports, with every constraint enforced', async () => {
      const counted = {};
      for (const tableKey of Object.keys(COUNTS)) {
        counted[tableKey] = (await db.select().from(parkSchema[tableKey])).length;
      }

      deq(counted, COUNTS);
      deq(report.rowCounts, COUNTS);
    });

    it('numbers the identity and serial keys from one', async () => {
      const parks = await db.select().from(parkSchema.parks).orderBy(asc(parkSchema.parks.id));

      deq(
        parks.map((park) => park.id),
        [1, 2, 3],
      );
    });

    it('stores dates, timestamps, decimals and enums as the columns declare them', async () => {
      const [letting] = await db.select().from(parkSchema.lettings).orderBy(asc(parkSchema.lettings.id));
      const [park] = await db.select().from(parkSchema.parks).orderBy(asc(parkSchema.parks.id));

      ok(/^\d{4}-\d{2}-\d{2}$/.test(letting.startDate));
      ok(/^\d+\.\d{2}$/.test(letting.siteFee));
      ok(['pending', 'confirmed', 'cancelled'].includes(letting.status));
      ok(/^\d{4}-\d{2}-\d{2}$/.test(park.openedAt));
      ok(park.createdAt instanceof Date);
    });

    it('refers every holiday home to a pitch and an owner postgres already holds', async () => {
      const homes = await db.select().from(parkSchema.holidayHomes);
      const pitchIds = new Set((await db.select().from(parkSchema.pitches)).map((pitch) => pitch.id));

      ok(homes.every((home) => pitchIds.has(home.pitchId)));
      eq(homes.length, COUNTS.holidayHomes);
    });

    it('refers owners only to owners inserted before them', async () => {
      const owners = await db.select().from(parkSchema.owners);
      const referred = owners.filter((owner) => owner.referredByOwnerId !== null);

      ok(referred.length > 0);
      ok(referred.every((owner) => owners.some((other) => other.id === owner.referredByOwnerId)));
    });
  });
});
