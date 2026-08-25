const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, ok, throws } = require('node:assert');
const { constant, createInMemoryGraphSink, generate } = require('../lib');
const { everyParkTableCounted, structuralParkRules } = require('./lib/park-rules');
const parkSchema = require('./lib/park-schema');

const SEED = 42;
const REFERENCE_DATE = new Date('2024-06-01T00:00:00.000Z');

const COUNTS = {
  parks: 3,
  pitches: 6,
  owners: 8,
  holidayHomes: 7,
  accessories: 5,
  lettings: 6,
  parkOwners: 4,
};

const graphOf = (overrides = {}) =>
  generate(
    {
      schema: parkSchema,
      rules: structuralParkRules,
      counts: COUNTS,
      seed: SEED,
      referenceDate: REFERENCE_DATE,
      ...overrides,
    },
    createInMemoryGraphSink(),
  );

describe('in memory graph sink', () => {
  describe('collected rows', () => {
    it('collects every generated row, in generation order', async () => {
      const graph = await graphOf();

      deq(Object.keys(graph.rows), [
        'owners',
        'parks',
        'pitches',
        'holidayHomes',
        'accessories',
        'lettings',
        'parkOwners',
      ]);
      for (const [tableKey, count] of Object.entries(COUNTS)) eq(graph.rows[tableKey].length, count);
      deq(
        graph.rows.parks.map((park) => park.id),
        [1, 2, 3],
      );
    });

    it('collects a table counted at zero as an empty list', async () => {
      const graph = await graphOf({ counts: { parks: 0 } });

      deq(graph.rows, { parks: [] });
    });

    it('leaves uncounted tables out of the graph', async () => {
      const graph = await graphOf({ counts: { parks: 1, owners: 1 } });

      deq(Object.keys(graph.rows), ['owners', 'parks']);
    });

    it('folds the report into the graph', async () => {
      const graph = await graphOf();

      eq(graph.report.seed, SEED);
      eq(graph.report.referenceDate, REFERENCE_DATE);
      deq(graph.report.rowCounts, COUNTS);
    });
  });

  describe('parentOf', () => {
    it('returns the parent row a foreign key points at', async () => {
      const graph = await graphOf();

      for (const pitch of graph.rows.pitches) {
        const park = graph.parentOf('pitches', pitch, 'parkId');
        eq(park.id, pitch.parkId);
        ok(graph.rows.parks.includes(park));
      }
    });

    it('returns the identical row object, not a copy', async () => {
      const graph = await graphOf();
      const [pitch] = graph.rows.pitches;

      eq(
        graph.parentOf('pitches', pitch, 'parkId'),
        graph.rows.parks.find((park) => park.id === pitch.parkId),
      );
    });

    it('returns null for a nullable foreign key which is null', async () => {
      const graph = await graphOf({ counts: { ...COUNTS, holidayHomes: 40 } });
      const unowned = graph.rows.holidayHomes.filter((home) => home.previousOwnerId === null);

      ok(unowned.length > 0);
      for (const home of unowned) eq(graph.parentOf('holidayHomes', home, 'previousOwnerId'), null);
    });

    it('tells two foreign keys to the same table apart by column', async () => {
      const graph = await graphOf({ counts: { ...COUNTS, holidayHomes: 40 } });
      const owned = graph.rows.holidayHomes.find((home) => home.previousOwnerId !== null);

      eq(graph.parentOf('holidayHomes', owned, 'ownerId').id, owned.ownerId);
      eq(graph.parentOf('holidayHomes', owned, 'previousOwnerId').id, owned.previousOwnerId);
    });

    it('navigates a self reference to the owner who referred them', async () => {
      const graph = await graphOf({ counts: { parks: 1, owners: 60 } });
      const referred = graph.rows.owners.filter((owner) => owner.referredByOwnerId !== null);

      ok(referred.length > 0);
      for (const owner of referred) {
        eq(graph.parentOf('owners', owner, 'referredByOwnerId').id, owner.referredByOwnerId);
      }
    });

    it('returns null for the root of a self reference', async () => {
      const graph = await graphOf({ counts: { parks: 1, owners: 60 } });

      eq(graph.parentOf('owners', graph.rows.owners[0], 'referredByOwnerId'), null);
    });

    it('navigates a composite key table to each of its parents', async () => {
      const graph = await graphOf();

      for (const parkOwner of graph.rows.parkOwners) {
        eq(graph.parentOf('parkOwners', parkOwner, 'parkId').id, parkOwner.parkId);
        eq(graph.parentOf('parkOwners', parkOwner, 'ownerId').id, parkOwner.ownerId);
      }
    });
  });

  describe('childrenOf', () => {
    it('returns exactly the children of the parent it is given', async () => {
      const graph = await graphOf();

      for (const park of graph.rows.parks) {
        const pitches = graph.childrenOf('parks', park, 'pitches');

        deq(
          pitches,
          graph.rows.pitches.filter((pitch) => pitch.parkId === park.id),
        );
      }
    });

    it('accounts for every child across all the parents', async () => {
      const graph = await graphOf();
      const gathered = graph.rows.parks.flatMap((park) => graph.childrenOf('parks', park, 'pitches'));

      eq(gathered.length, COUNTS.pitches);
    });

    it('returns an empty list for a parent with no children', async () => {
      const graph = await graphOf({
        counts: { parks: 4, pitches: { per: 'parks', count: (context) => (context.rowIndex === 0 ? 0 : 2) } },
      });

      deq(graph.childrenOf('parks', graph.rows.parks[0], 'pitches'), []);
      eq(graph.childrenOf('parks', graph.rows.parks[1], 'pitches').length, 2);
    });

    it('rejects a relationship with two candidate foreign keys', async () => {
      const graph = await graphOf();

      throws(() => graph.childrenOf('owners', graph.rows.owners[0], 'holidayHomes'), {
        name: 'AmbiguousRelationshipError',
        message:
          'Table holidayHomes has foreign keys ownerId and previousOwnerId to table owners, ' +
          'so childrenOf cannot tell which relationship you mean. ' +
          'Navigate from the holidayHomes side with parentOf, naming the column.',
        parentTable: 'owners',
        childTable: 'holidayHomes',
        columns: ['ownerId', 'previousOwnerId'],
      });
    });

    it('rejects a relationship which does not exist', async () => {
      const graph = await graphOf();

      throws(() => graph.childrenOf('owners', graph.rows.owners[0], 'pitches'), {
        name: 'AmbiguousRelationshipError',
        message:
          'Table pitches has no foreign key at all to table owners, ' +
          'so childrenOf cannot tell which relationship you mean. ' +
          'Navigate from the pitches side with parentOf, naming the column.',
        columns: [],
      });
    });
  });

  describe('the worked example from the design', () => {
    it('pins a letting with an override and navigates back to its holiday home', async () => {
      const graph = await generate(
        {
          schema: parkSchema,
          rules: structuralParkRules,
          counts: { parks: 1, holidayHomes: 1, owners: 2, lettings: 3, pitches: 1 },
          overrides: { lettings: [{ status: 'cancelled' }] },
          seed: SEED,
          referenceDate: REFERENCE_DATE,
        },
        createInMemoryGraphSink(),
      );
      const [letting] = graph.rows.lettings;

      eq(letting.status, 'cancelled');
      eq(graph.parentOf('lettings', letting, 'holidayHomeId').id, letting.holidayHomeId);
      deq(graph.childrenOf('holidayHomes', graph.rows.holidayHomes[0], 'lettings'), graph.rows.lettings);
    });

    it('navigates from a pinned relationship', async () => {
      const graph = await generate(
        {
          schema: parkSchema,
          rules: structuralParkRules,
          counts: { parks: 3, pitches: { per: 'parks', count: constant(2) } },
          seed: SEED,
          referenceDate: REFERENCE_DATE,
        },
        createInMemoryGraphSink(),
      );

      for (const park of graph.rows.parks) {
        const pitches = graph.childrenOf('parks', park, 'pitches');
        eq(pitches.length, 2);
        for (const pitch of pitches) eq(graph.parentOf('pitches', pitch, 'parkId'), park);
      }
    });
  });
});
