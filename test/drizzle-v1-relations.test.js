const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, ok, throws } = require('node:assert');
const { defineRelations } = require('drizzle-orm');
const { integer, pgTable, varchar } = require('drizzle-orm/pg-core');
const { createInMemoryGraphSink, derive, generate, structuralDefault } = require('../lib');

// These tests exercise the drizzle-orm 1.0.0 defineRelations API, which does not exist before
// 1.0.0, so they skip themselves on the baseline install. `npm run test:drizzle-v1` swap-installs
// the pinned 1.0.0 pre-release and runs this file with the library resolving it for everything,
// exactly as a consuming project on 1.0.0 does. Restore the baseline afterwards with `npm ci`.
const available = typeof defineRelations === 'function';
const declared = (declare) => (available ? declare() : undefined);

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

const parkDeclarations = declared(() =>
  defineRelations({ parks, pitches }, (r) => ({
    parks: { pitches: r.many.pitches() },
    pitches: { park: r.one.parks({ from: r.pitches.parkId, to: r.parks.id }) },
  })),
);

const rowNumber = derive((_row, context) => context.rowIndex + 1);

const parkRules = {
  parks: { id: rowNumber, name: structuralDefault },
  pitches: { id: rowNumber, parkId: structuralDefault },
};

const generateParks = (schema, counts = { parks: 2, pitches: 5 }, rules = parkRules) =>
  generate({ schema, rules, counts, seed: SEED }, createInMemoryGraphSink());

describe('graph navigation from defineRelations declarations', { skip: !available }, () => {
  it('walks a many() resolved from its inverse to the exact child rows', async () => {
    const data = await generateParks({ parks, pitches, parkDeclarations });

    for (const park of data.rows.parks) {
      deq(
        park.pitches,
        data.rows.pitches.filter((pitch) => pitch.parkId === park.id),
      );
    }
  });

  it('walks a one() to the identical parent row, not a copy', async () => {
    const data = await generateParks({ parks, pitches, parkDeclarations });

    for (const pitch of data.rows.pitches) {
      eq(
        pitch.park,
        data.rows.parks.find((park) => park.id === pitch.parkId),
      );
    }
  });

  it('navigates a nullable one() to null when the foreign key is null', async () => {
    const wardens = pgTable('wardens', { id: integer('id').primaryKey() });
    const halls = pgTable('halls', {
      id: integer('id').primaryKey(),
      wardenId: integer('warden_id').references(() => wardens.id),
    });
    const hallDeclarations = defineRelations({ wardens, halls }, (r) => ({
      halls: { warden: r.one.wardens({ from: r.halls.wardenId, to: r.wardens.id }) },
    }));

    const data = await generate(
      {
        schema: { wardens, halls, hallDeclarations },
        rules: { wardens: { id: rowNumber }, halls: { id: rowNumber, wardenId: () => null } },
        counts: { wardens: 1, halls: 2 },
        seed: SEED,
      },
      createInMemoryGraphSink(),
    );

    for (const hall of data.rows.halls) eq(hall.warden, null);
  });

  it('pairs the two sides by alias when one table is referenced twice', async () => {
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
    const ownerDeclarations = defineRelations({ owners, homes }, (r) => ({
      owners: {
        ownedHomes: r.many.homes({ alias: 'owner' }),
        billedHomes: r.many.homes({ alias: 'billing' }),
      },
      homes: {
        owner: r.one.owners({ from: r.homes.ownerId, to: r.owners.id, alias: 'owner' }),
        billingOwner: r.one.owners({ from: r.homes.billingOwnerId, to: r.owners.id, alias: 'billing' }),
      },
    }));

    const data = await generate(
      {
        schema: { owners, homes, ownerDeclarations },
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
});

describe('defineRelations declarations the graph cannot resolve', { skip: !available }, () => {
  it('generates anyway, and throws only when a through() relation is walked', async () => {
    const memberships = pgTable('memberships', {
      parkId: integer('park_id')
        .notNull()
        .references(() => parks.id),
      pitchId: integer('pitch_id')
        .notNull()
        .references(() => pitches.id),
    });
    const junctionDeclarations = defineRelations({ parks, pitches, memberships }, (r) => ({
      parks: {
        pitches: r.many.pitches({
          from: r.parks.id.through(r.memberships.parkId),
          to: r.pitches.id.through(r.memberships.pitchId),
        }),
      },
    }));

    const data = await generateParks({ parks, pitches, memberships, junctionDeclarations });

    eq(data.rows.parks.length, 2);
    throws(() => data.rows.parks[0].pitches, {
      name: 'UnresolvableRelationError',
      table: 'parks',
      relation: 'pitches',
      referencedTable: 'pitches',
      reason: 'through',
      message:
        'Relation parks.pitches cannot be resolved: it joins pitches through another table, and ' +
        "in-memory navigation does not run joins. Navigate the junction table's own relations instead.",
    });
  });

  it('refuses a where-filtered relation only when it is walked', async () => {
    const filteredDeclarations = defineRelations({ parks, pitches }, (r) => ({
      parks: {
        bigPitches: r.many.pitches({
          from: r.parks.id,
          to: r.pitches.parkId,
          where: { id: { gt: 3 } },
        }),
      },
      pitches: { park: r.one.parks({ from: r.pitches.parkId, to: r.parks.id }) },
    }));

    const data = await generateParks({ parks, pitches, filteredDeclarations });

    ok(data.rows.pitches[0].park, 'the unfiltered one() on the other side should still navigate');
    throws(() => data.rows.parks[0].bigPitches, {
      name: 'UnresolvableRelationError',
      table: 'parks',
      relation: 'bigPitches',
      referencedTable: 'pitches',
      reason: 'filtered',
      message:
        'Relation parks.bigPitches cannot be resolved: it declares a where filter, and in-memory ' +
        'navigation does not apply filters. Declare an unfiltered relation to pitches, or filter the rows yourself.',
    });
  });

  it('records a relation whose table the schema module does not export', async () => {
    const data = await generateParks({ parks, parkDeclarations }, { parks: 2 }, { parks: parkRules.parks });

    eq(data.rows.parks.length, 2);
    throws(() => data.rows.parks[0].pitches, {
      name: 'UnresolvableRelationError',
      table: 'parks',
      relation: 'pitches',
      reason: 'unknownTable',
      message:
        'Relation parks.pitches references a table missing from the schema module. ' +
        'Export the referenced table alongside its relations.',
    });
  });
});
