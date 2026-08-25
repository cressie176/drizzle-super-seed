const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, ok, throws } = require('node:assert');
const { relations } = require('drizzle-orm');
const { integer, pgTable, varchar } = require('drizzle-orm/pg-core');
const { createInMemoryGraphSink, derive, generate, structuralDefault } = require('../lib');

const SEED = 3;

const parks = pgTable('parks', {
  id: integer('id').primaryKey(),
  name: varchar('name', { length: 20 }).notNull(),
});

const pitches = pgTable('pitches', {
  id: integer('id').primaryKey(),
  parkId: integer('park_id')
    .notNull()
    .references(() => parks.id),
});

const parkRelations = relations(parks, ({ many }) => ({ pitches: many(pitches) }));
const pitchRelations = relations(pitches, ({ one }) => ({
  park: one(parks, { fields: [pitches.parkId], references: [parks.id] }),
}));

const rowNumber = derive((_row, context) => context.rowIndex + 1);

const parkSchema = { parks, pitches, parkRelations, pitchRelations };
const parkRules = {
  parks: { id: rowNumber, name: structuralDefault },
  pitches: { id: rowNumber, parkId: structuralDefault },
};

const generateParks = (schema = parkSchema, counts = { parks: 2, pitches: 5 }) =>
  generate({ schema, rules: parkRules, counts, seed: SEED }, createInMemoryGraphSink());

describe('graph navigation from relations declarations', () => {
  it('walks a many() to the exact child rows', async () => {
    const data = await generateParks();

    for (const park of data.rows.parks) {
      deq(
        park.pitches,
        data.rows.pitches.filter((pitch) => pitch.parkId === park.id),
      );
    }
  });

  it('walks a one() to the identical parent row, not a copy', async () => {
    const data = await generateParks();

    for (const pitch of data.rows.pitches) {
      eq(
        pitch.park,
        data.rows.parks.find((park) => park.id === pitch.parkId),
      );
    }
  });

  it('follows a cycle as far as the caller cares to walk', async () => {
    const data = await generateParks();
    const populated = data.rows.parks.find((park) => park.pitches.length > 0);

    eq(populated.pitches[0].park, populated);
    eq(populated.pitches[0].park.pitches[0].park.name, populated.name);
  });

  it('resolves once and returns the identical value thereafter', async () => {
    const data = await generateParks();
    const [park] = data.rows.parks;

    eq(park.pitches, park.pitches);
  });

  it('is invisible to JSON, deepEqual and property enumeration', async () => {
    const data = await generateParks();
    const populated = data.rows.parks.find((park) => park.pitches.length > 0);
    void populated.pitches[0].park;

    deq(populated, { id: populated.id, name: populated.name });
    deq(Object.keys(populated), ['id', 'name']);
    eq(JSON.stringify(populated).includes('pitches'), false);
    deq(JSON.parse(JSON.stringify(data.rows.parks)), data.rows.parks);
  });

  it('leaves a column standing when a relation shares its name', async () => {
    const shadowed = relations(pitches, ({ one }) => ({
      parkId: one(parks, { fields: [pitches.parkId], references: [parks.id] }),
    }));

    const data = await generateParks({ parks, pitches, parkRelations, shadowed });

    for (const pitch of data.rows.pitches) ok(typeof pitch.parkId === 'number');
  });

  it('navigates a nullable one() to null when the foreign key is null', async () => {
    const wardens = pgTable('wardens', { id: integer('id').primaryKey() });
    const halls = pgTable('halls', {
      id: integer('id').primaryKey(),
      wardenId: integer('warden_id').references(() => wardens.id),
    });
    const hallRelations = relations(halls, ({ one }) => ({
      warden: one(wardens, { fields: [halls.wardenId], references: [wardens.id] }),
    }));

    const data = await generate(
      {
        schema: { wardens, halls, hallRelations },
        rules: { wardens: { id: rowNumber }, halls: { id: rowNumber, wardenId: () => null } },
        counts: { wardens: 1, halls: 2 },
        seed: SEED,
      },
      createInMemoryGraphSink(),
    );

    for (const hall of data.rows.halls) eq(hall.warden, null);
  });

  it('returns nothing rather than throwing when the target table was not generated', async () => {
    const data = await generate(
      { schema: parkSchema, rules: parkRules, counts: { parks: 2 }, seed: SEED },
      createInMemoryGraphSink(),
    );

    deq(data.rows.parks[0].pitches, []);
  });

  it('pairs the two sides by relationName when one table is referenced twice', async () => {
    const owners = pgTable('owners', { id: integer('id').primaryKey() });
    const homes = pgTable('homes', {
      id: integer('id').primaryKey(),
      ownerId: integer('owner_id')
        .notNull()
        .references(() => owners.id),
      billingOwnerId: integer('billing_owner_id')
        .notNull()
        .references(() => owners.id),
    });
    const ownerRelations = relations(owners, ({ many }) => ({
      ownedHomes: many(homes, { relationName: 'owner' }),
      billedHomes: many(homes, { relationName: 'billing' }),
    }));
    const homeRelations = relations(homes, ({ one }) => ({
      owner: one(owners, { fields: [homes.ownerId], references: [owners.id], relationName: 'owner' }),
      billingOwner: one(owners, { fields: [homes.billingOwnerId], references: [owners.id], relationName: 'billing' }),
    }));

    const data = await generate(
      {
        schema: { owners, homes, ownerRelations, homeRelations },
        rules: {
          owners: { id: rowNumber },
          homes: { id: rowNumber, ownerId: () => 1, billingOwnerId: () => 2 },
        },
        counts: { owners: 2, homes: 3 },
        seed: SEED,
      },
      createInMemoryGraphSink(),
    );

    eq(data.rows.owners[0].ownedHomes.length, 3);
    eq(data.rows.owners[0].billedHomes.length, 0);
    eq(data.rows.owners[1].billedHomes.length, 3);
    eq(data.rows.homes[0].owner.id, 1);
    eq(data.rows.homes[0].billingOwner.id, 2);
  });

  it('shows patched values when a deferred pass rewrote the rows', async () => {
    const keepers = pgTable('keepers', {
      id: integer('id').primaryKey(),
      hallId: integer('hall_id')
        .notNull()
        .references(() => halls.id),
    });
    const halls = pgTable('halls', {
      id: integer('id').primaryKey(),
      keeperId: integer('keeper_id').references(() => keepers.id),
    });
    const hallRelations = relations(halls, ({ one }) => ({
      keeper: one(keepers, { fields: [halls.keeperId], references: [keepers.id] }),
    }));

    const data = await generate(
      {
        schema: { keepers, halls, hallRelations },
        rules: {
          keepers: { id: rowNumber, hallId: structuralDefault },
          halls: { id: rowNumber, keeperId: structuralDefault },
        },
        counts: { keepers: 6, halls: 6 },
        seed: SEED,
      },
      createInMemoryGraphSink(),
    );

    const assigned = data.rows.halls.filter((hall) => hall.keeperId !== null);
    ok(assigned.length > 0, 'the deferred pass assigned nobody, weakening the fixture');
    for (const hall of assigned) eq(hall.keeper.id, hall.keeperId);
  });
});

describe('relations the graph cannot resolve', () => {
  it('generates anyway, and throws only when the broken relation is walked', async () => {
    const oneSided = relations(parks, ({ many }) => ({ plots: many(pitches) }));
    const data = await generateParks({ parks, pitches, oneSided });

    eq(data.rows.parks.length, 2);
    throws(() => data.rows.parks[0].plots, {
      name: 'UnresolvableRelationError',
      table: 'parks',
      relation: 'plots',
      referencedTable: 'pitches',
      reason: 'noInverse',
      message:
        'Relation parks.plots cannot be resolved: no inverse one() with fields and references is ' +
        'declared on pitches. Declare the inverse, or navigate with childrenOf.',
    });
  });

  it('names an ambiguity the two sides must resolve with relationName', async () => {
    const owners = pgTable('owners', { id: integer('id').primaryKey() });
    const homes = pgTable('homes', {
      id: integer('id').primaryKey(),
      ownerId: integer('owner_id')
        .notNull()
        .references(() => owners.id),
      billingOwnerId: integer('billing_owner_id')
        .notNull()
        .references(() => owners.id),
    });
    const ownerRelations = relations(owners, ({ many }) => ({ homes: many(homes) }));
    const homeRelations = relations(homes, ({ one }) => ({
      owner: one(owners, { fields: [homes.ownerId], references: [owners.id] }),
      billingOwner: one(owners, { fields: [homes.billingOwnerId], references: [owners.id] }),
    }));

    const data = await generate(
      {
        schema: { owners, homes, ownerRelations, homeRelations },
        rules: { owners: { id: rowNumber }, homes: { id: rowNumber, ownerId: () => 1, billingOwnerId: () => 1 } },
        counts: { owners: 1, homes: 1 },
        seed: SEED,
      },
      createInMemoryGraphSink(),
    );

    throws(() => data.rows.owners[0].homes, {
      name: 'UnresolvableRelationError',
      reason: 'ambiguousInverse',
      message:
        'Relation owners.homes cannot be resolved: more than one inverse one() on homes could serve ' +
        'it. Give each pair the same relationName so they match up.',
    });
  });

  it('names a relation pointing at a table the schema module does not export', async () => {
    const elsewhere = pgTable('elsewhere', { id: integer('id').primaryKey() });
    const strayRelations = relations(parks, ({ many }) => ({ strays: many(elsewhere) }));

    const data = await generateParks({ parks, pitches, parkRelations, pitchRelations, strayRelations });

    throws(() => data.rows.parks[0].strays, {
      name: 'UnresolvableRelationError',
      reason: 'unknownTable',
      message:
        'Relation parks.strays references a table missing from the schema module. ' +
        'Export the referenced table alongside its relations.',
    });
  });
});
