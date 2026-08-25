const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, notDeepEqual: notDeq, ok, rejects } = require('node:assert');
const { constant, derive, generate, sequence, structuralDefault, zipfInteger } = require('../lib');
const { structuralParkRules } = require('./lib/park-rules');
const parkSchema = require('./lib/park-schema');
const { createRecordingSink, rowsOf, valuesOf } = require('./lib/recording-sink');

const SEED = 42;
const REFERENCE_DATE = new Date('2024-06-01T00:00:00.000Z');

const generateParks = (overrides = {}) =>
  generate(
    {
      schema: parkSchema,
      rules: structuralParkRules,
      seed: SEED,
      referenceDate: REFERENCE_DATE,
      ...overrides,
    },
    createRecordingSink(),
  );

const rulesFor = (tableKey, columns) => ({
  ...structuralParkRules,
  [tableKey]: { ...structuralParkRules[tableKey], ...columns },
});

const countBy = (rows, propertyName) => {
  const counts = new Map();
  for (const row of rows) counts.set(row[propertyName], (counts.get(row[propertyName]) ?? 0) + 1);
  return counts;
};

const recording = (generator) => {
  const drawn = [];
  const recorded = (context) => {
    const value = generator(context);
    drawn.push(value);
    return value;
  };
  recorded.drawn = drawn;
  return recorded;
};

describe('per parent counts', () => {
  describe('cardinality', () => {
    it('generates a fixed number of children for every parent', async () => {
      const result = await generateParks({
        counts: { parks: 4, pitches: { per: 'parks', count: constant(3) } },
      });
      const pitches = rowsOf(result, 'pitches');

      eq(pitches.length, 12);
      eq(result.report.rowCounts.pitches, 12);
      deq([...countBy(pitches, 'parkId').values()], [3, 3, 3, 3]);
    });

    it('gives every child the parent it was counted against', async () => {
      const result = await generateParks({
        counts: { parks: 4, pitches: { per: 'parks', count: constant(2) } },
      });
      const parkIds = valuesOf(result, 'parks', 'id');

      deq(
        valuesOf(result, 'pitches', 'parkId'),
        parkIds.flatMap((id) => [id, id]),
      );
    });

    it('generates as many rows in total as the count generator drew', async () => {
      const count = recording(zipfInteger(0, 50));
      const result = await generateParks({ counts: { parks: 20, pitches: { per: 'parks', count } } });
      const drawnTotal = count.drawn.reduce((total, drawn) => total + drawn, 0);

      eq(count.drawn.length, 20);
      eq(rowsOf(result, 'pitches').length, drawnTotal);
      eq(result.report.rowCounts.pitches, drawnTotal);
    });

    it('skews the children across parents when the count generator is skewed', async () => {
      const result = await generateParks({
        counts: { parks: 20, pitches: { per: 'parks', count: zipfInteger(0, 50) } },
      });
      const perPark = [...countBy(rowsOf(result, 'pitches'), 'parkId').values()].sort((a, b) => b - a);

      ok(perPark[0] > perPark[perPark.length - 1] * 3);
    });

    it('generates no children for a parent counted at zero', async () => {
      const result = await generateParks({ counts: { parks: 3, pitches: { per: 'parks', count: constant(0) } } });

      eq(rowsOf(result, 'pitches').length, 0);
      deq(result.report.rowCounts, { parks: 3, pitches: 0 });
    });

    it('numbers the rows of a per parent table across the whole table', async () => {
      const result = await generateParks({
        counts: { parks: 3, pitches: { per: 'parks', count: constant(2) } },
        rules: rulesFor('pitches', { reference: sequence((index) => `pitch-${index}`) }),
      });

      deq(valuesOf(result, 'pitches', 'reference'), ['pitch-0', 'pitch-1', 'pitch-2', 'pitch-3', 'pitch-4', 'pitch-5']);
    });
  });

  describe('the parent row', () => {
    it('offers the parent primary key to a child rule', async () => {
      const result = await generateParks({
        counts: { parks: 3, pitches: { per: 'parks', count: constant(1) } },
        rules: rulesFor('pitches', { reference: derive((_row, context) => `park ${context.parentRow.id}`) }),
      });

      deq(valuesOf(result, 'pitches', 'reference'), ['park 1', 'park 2', 'park 3']);
    });

    it('offers the retained columns a child asked for', async () => {
      const result = await generateParks({
        counts: { parks: 3, pitches: { per: 'parks', count: constant(2), retain: ['openedAt'] } },
        rules: rulesFor('pitches', { reference: derive((_row, context) => context.parentRow.openedAt) }),
      });
      const openings = new Map(rowsOf(result, 'parks').map((park) => [park.id, park.openedAt]));

      for (const pitch of rowsOf(result, 'pitches')) eq(pitch.reference, openings.get(pitch.parkId));
    });

    it('offers no parent row to a table counted with a fixed number', async () => {
      const offered = [];
      await generateParks({
        counts: { parks: 3 },
        rules: rulesFor('parks', {
          region: derive((_row, context) => {
            offered.push('parentRow' in context);
            return 'south-west';
          }),
        }),
      });

      deq(offered, [false, false, false]);
    });

    it('offers the parent row and the parent index to the count generator', async () => {
      const seen = [];
      await generateParks({
        counts: {
          parks: 3,
          pitches: {
            per: 'parks',
            retain: ['region'],
            count: (context) => {
              seen.push([context.rowIndex, context.parentRow.id, context.parentRow.region]);
              return 1;
            },
          },
        },
      });
      const parkRegions = seen.map((each) => each[2]);

      deq(
        seen.map((each) => [each[0], each[1]]),
        [
          [0, 1],
          [1, 2],
          [2, 3],
        ],
      );
      ok(parkRegions.every((region) => typeof region === 'string'));
    });
  });

  describe('invalid per parent counts', () => {
    it('rejects a count per a table the child does not reference', async () => {
      await rejects(generateParks({ counts: { parks: 1, owners: { per: 'parks', count: constant(1) } } }), {
        name: 'InvalidPerParentError',
        message:
          'Table owners is counted per parks row, but has no foreign key to parks, ' +
          'so there is no column to attach a parks row to. ' +
          'Count owners per a table it references, or give it a fixed count.',
        reason: 'noForeignKey',
        table: 'owners',
        parentTable: 'parks',
        columns: [],
      });
    });

    it('rejects a count per a table the child references twice', async () => {
      await rejects(
        generateParks({
          counts: {
            parks: 1,
            pitches: 1,
            owners: 2,
            holidayHomes: { per: 'owners', count: constant(1) },
          },
        }),
        {
          name: 'InvalidPerParentError',
          message:
            'Table holidayHomes is counted per owners row, but references owners through ' +
            'ownerId and previousOwnerId, so drizzle-super-seed cannot tell which column the count belongs to. ' +
            'Give holidayHomes a fixed count, and pin the relationship you mean with a rule on the column.',
          reason: 'ambiguousForeignKey',
          table: 'holidayHomes',
          parentTable: 'owners',
          columns: ['ownerId', 'previousOwnerId'],
        },
      );
    });

    it('rejects a count per the table itself', async () => {
      await rejects(generateParks({ counts: { parks: 1, owners: { per: 'owners', count: constant(1) } } }), {
        name: 'InvalidPerParentError',
        message:
          'Table owners is counted per owners row, which is its own table, so it has no parent to count against. ' +
          'Give owners a fixed count, or count it per the table it belongs to.',
        reason: 'ownTable',
        table: 'owners',
        parentTable: 'owners',
      });
    });

    it('rejects a count per a table which has no count of its own', async () => {
      await rejects(generateParks({ counts: { pitches: { per: 'parks', count: constant(1) } } }), {
        name: 'MissingParentCountError',
        message:
          'Table pitches is counted per parks row, but parks has no count of its own, ' +
          'so there are no rows to count against. Add a count for parks, or give pitches a fixed count.',
        table: 'pitches',
        parentTable: 'parks',
      });
    });

    it('rejects an invalid count before generating any row', async () => {
      const written = [];
      await rejects(
        generate(
          {
            schema: parkSchema,
            rules: structuralParkRules,
            counts: { parks: 3, owners: { per: 'parks', count: constant(1) } },
            seed: SEED,
          },
          { writeRows: (table, rows) => written.push([table.key, rows.length]), end: () => {} },
        ),
        { name: 'InvalidPerParentError' },
      );

      deq(written, []);
    });
  });

  describe('chained per parent counts', () => {
    it('counts grandchildren per child', async () => {
      const result = await generateParks({
        counts: {
          parks: 2,
          pitches: { per: 'parks', count: constant(2) },
          owners: 3,
          holidayHomes: { per: 'pitches', count: constant(2) },
        },
      });

      eq(rowsOf(result, 'pitches').length, 4);
      eq(rowsOf(result, 'holidayHomes').length, 8);
      deq([...countBy(rowsOf(result, 'holidayHomes'), 'pitchId').values()], [2, 2, 2, 2]);
    });

    it('leaves the other foreign keys of a per parent child to the engine', async () => {
      const result = await generateParks({
        counts: {
          parks: 2,
          pitches: { per: 'parks', count: constant(2) },
          owners: 3,
          holidayHomes: { per: 'pitches', count: constant(2) },
        },
      });
      const ownerIds = new Set(valuesOf(result, 'owners', 'id'));

      ok(valuesOf(result, 'holidayHomes', 'ownerId').every((ownerId) => ownerIds.has(ownerId)));
    });
  });

  describe('reproducibility', () => {
    it('generates identical rows for the same seed', async () => {
      const counts = { parks: 5, pitches: { per: 'parks', count: zipfInteger(0, 20) } };
      const [first, second] = [await generateParks({ counts }), await generateParks({ counts })];

      deq(second.rowsByTable, first.rowsByTable);
    });
  });

  describe('batching', () => {
    it('fills batches across parent boundaries', async () => {
      const result = await generateParks({
        counts: { parks: 3, pitches: { per: 'parks', count: constant(3) } },
        batchSize: 4,
      });

      deq(
        result.batches.filter((batch) => batch.tableKey === 'pitches').map((batch) => batch.rows.length),
        [4, 4, 1],
      );
    });
  });
});

describe('overrides', () => {
  const CANCELLED = 'cancelled';

  const withoutStatus = (rows) => rows.map(({ status, ...remaining }) => remaining);

  const generateLettings = (overrides, counts = {}) =>
    generateParks({
      counts: { parks: 1, pitches: 1, owners: 1, holidayHomes: 1, lettings: 3, ...counts },
      overrides,
    });

  it('pins a column of the row it is given for', async () => {
    const result = await generateLettings({ lettings: [{ status: CANCELLED }] });
    const statuses = valuesOf(result, 'lettings', 'status');

    eq(statuses[0], CANCELLED);
    eq(statuses.length, 3);
  });

  it('touches no column of the overridden row but the one it names', async () => {
    const cancelled = await generateLettings({ lettings: [{ status: CANCELLED }] });
    const pending = await generateLettings({ lettings: [{ status: 'pending' }] });

    deq(withoutStatus(rowsOf(cancelled, 'lettings')), withoutStatus(rowsOf(pending, 'lettings')));
    deq(valuesOf(cancelled, 'lettings', 'status').slice(0, 1), [CANCELLED]);
    deq(valuesOf(pending, 'lettings', 'status').slice(0, 1), ['pending']);
  });

  it('skips rows given as undefined, null or an empty object, overriding only the rows named', async () => {
    const result = await generateLettings({ lettings: [undefined, null, { status: CANCELLED }] });
    const statuses = valuesOf(result, 'lettings', 'status');

    eq(statuses[2], CANCELLED);
    eq(statuses.length, 3);

    const viaEmptyObjects = await generateLettings({ lettings: [{}, {}, { status: CANCELLED }] });
    deq(rowsOf(viaEmptyObjects, 'lettings'), rowsOf(result, 'lettings'));
  });

  it('leaves later rows free to generate any value', async () => {
    const result = await generateLettings({ lettings: [{ status: CANCELLED }] }, { lettings: 200 });
    const later = valuesOf(result, 'lettings', 'status').slice(1);

    ok(new Set(later).size > 1);
  });

  it('shifts the random stream, because an overridden column draws nothing', async () => {
    const overridden = await generateLettings({ lettings: [{ status: CANCELLED }] });
    const plain = await generateLettings({});

    notDeq(rowsOf(overridden, 'lettings')[1], rowsOf(plain, 'lettings')[1]);
  });

  it('shows the overridden value to a rule on the same row', async () => {
    const result = await generateLettings(
      { lettings: [{ status: CANCELLED }] },
      {
        lettings: 2,
      },
    );

    const notes = await generateParks({
      counts: { parks: 1, pitches: 1, owners: 1, holidayHomes: 1, lettings: 2 },
      overrides: { lettings: [{ status: CANCELLED }] },
      rules: rulesFor('lettings', { notes: derive((row) => `status is ${row.status}`) }),
    });

    eq(rowsOf(result, 'lettings').length, 2);
    eq(valuesOf(notes, 'lettings', 'notes')[0], `status is ${CANCELLED}`);
  });

  it('raises the count to the number of overrides', async () => {
    const result = await generateLettings(
      { lettings: [{ status: CANCELLED }, { status: CANCELLED }, { status: CANCELLED }] },
      { lettings: 1 },
    );

    eq(rowsOf(result, 'lettings').length, 3);
    deq(valuesOf(result, 'lettings', 'status'), [CANCELLED, CANCELLED, CANCELLED]);
  });

  it('accepts a generator as an overridden value', async () => {
    const result = await generateLettings({
      lettings: [{ guestName: (context) => `guest ${context.rowIndex}` }, { guestName: constant('Sam Kerrigan') }],
    });

    deq(valuesOf(result, 'lettings', 'guestName').slice(0, 2), ['guest 0', 'Sam Kerrigan']);
  });

  it('pins a relationship through a foreign key column', async () => {
    const result = await generateParks({
      counts: { parks: 3, pitches: 4 },
      overrides: { pitches: [{ parkId: 3 }, { parkId: 3 }] },
    });

    deq(valuesOf(result, 'pitches', 'parkId').slice(0, 2), [3, 3]);
  });

  it('pins a foreign key whose parent generated no rows at all', async () => {
    const result = await generateParks({
      counts: { parks: 0, pitches: 1 },
      overrides: { pitches: [{ parkId: 7 }] },
    });

    deq(valuesOf(result, 'pitches', 'parkId'), [7]);
  });

  it('pins a generated always identity column', async () => {
    const result = await generateParks({ counts: { parks: 3 }, overrides: { parks: [{ id: 100 }] } });

    deq(valuesOf(result, 'parks', 'id'), [100, 2, 3]);
  });

  it('rejects an identity override which collides with the engine counter', async () => {
    await rejects(generateParks({ counts: { parks: 2 }, overrides: { parks: [{ id: 2 }] } }), {
      name: 'UniqueConstraintExhaustedError',
      table: 'parks',
      columns: ['id'],
      seed: SEED,
    });
  });

  it('never regenerates an overridden column to satisfy a constraint', async () => {
    await rejects(
      generateParks({
        counts: { parks: 1, owners: 2 },
        overrides: { owners: [{ email: 'sam@example.com' }, { email: 'sam@example.com' }] },
      }),
      {
        name: 'UniqueConstraintExhaustedError',
        table: 'owners',
        columns: ['email'],
      },
    );
  });

  it('overrides a per parent child, outranking the pinned parent', async () => {
    const result = await generateParks({
      counts: { parks: 3, pitches: { per: 'parks', count: constant(1) } },
      overrides: { pitches: [{ parkId: 3 }] },
    });

    deq(valuesOf(result, 'pitches', 'parkId'), [3, 2, 3]);
  });

  it('ignores an override for a table which is not counted', async () => {
    const result = await generateParks({ counts: { parks: 1 }, overrides: { pitches: [{ reference: 'A1' }] } });

    deq(result.report.rowCounts, { parks: 1 });
  });

  it('generates nothing differently when the overrides are empty', async () => {
    const overridden = await generateParks({ counts: { parks: 2 }, overrides: { parks: [] } });
    const plain = await generateParks({ counts: { parks: 2 } });

    deq(overridden.rowsByTable, plain.rowsByTable);
  });
});
