const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, ok, rejects } = require('node:assert');
const { integer, pgTable, unique, varchar } = require('drizzle-orm/pg-core');
const {
  constant,
  createInMemoryGraphSink,
  createRowBatchSink,
  derive,
  generate,
  structuralDefault,
} = require('../lib');
const { structuralParkRules } = require('./lib/park-rules');
const parkSchema = require('./lib/park-schema');
const { createRecordingSink, deferredUpdatesOf, rowsOf, valuesOf } = require('./lib/recording-sink');

const SEED = 42;
const REFERENCE_DATE = new Date('2024-06-01T00:00:00.000Z');
const CYCLE_COUNTS = { parks: 200, staff: 400 };

const generateCycle = (overrides = {}) =>
  generate(
    {
      schema: parkSchema,
      rules: structuralParkRules,
      counts: CYCLE_COUNTS,
      seed: SEED,
      referenceDate: REFERENCE_DATE,
      ...overrides,
    },
    overrides.sink ?? createRecordingSink(),
  );

const rulesFor = (tableKey, columns) => ({
  ...structuralParkRules,
  [tableKey]: { ...structuralParkRules[tableKey], ...columns },
});

const wardenValues = (result) => deferredUpdatesOf(result, 'parks').map((update) => update.values.wardenId);

const rateOf = (values, matches) => values.filter(matches).length / values.length;

const closeTo = (actual, expected) => Math.abs(actual - expected) <= 0.05;

describe('deferred foreign keys', () => {
  describe('pass one', () => {
    it('leaves the deferred column null in the rows it writes', async () => {
      const result = await generateCycle();

      ok(valuesOf(result, 'parks', 'wardenId').every((value) => value === null));
    });

    it('gives the other side of the cycle a real parent', async () => {
      const result = await generateCycle();
      const parkIds = new Set(valuesOf(result, 'parks', 'id'));

      ok(valuesOf(result, 'staff', 'parkId').every((parkId) => parkIds.has(parkId)));
    });

    it('never evaluates the rule of a deferred column', async () => {
      const evaluated = () => {
        throw new Error('the deferred rule was evaluated in pass one');
      };

      await generateCycle({ rules: rulesFor('parks', { wardenId: evaluated }) });
    });
  });

  describe('the deferred pass', () => {
    it('runs after every table, once per row of the owning table', async () => {
      const result = await generateCycle();
      const inserts = result.calls.filter((call) => call.startsWith('writeRows'));
      const updates = result.calls.filter((call) => call.startsWith('writeDeferredUpdates'));

      eq(deferredUpdatesOf(result, 'parks').length, CYCLE_COUNTS.parks);
      ok(result.calls.indexOf(updates[0]) > result.calls.lastIndexOf(inserts[inserts.length - 1]));
    });

    it('keys each update by the primary key of the row it patches', async () => {
      const result = await generateCycle();

      deq(
        deferredUpdatesOf(result, 'parks').map((update) => update.primaryKey),
        rowsOf(result, 'parks').map((park) => ({ id: park.id })),
      );
    });

    it('assigns a real row of the referenced table, or null', async () => {
      const result = await generateCycle();
      const staffIds = new Set(valuesOf(result, 'staff', 'id'));

      ok(wardenValues(result).every((value) => value === null || staffIds.has(value)));
    });

    it('assigns null to about a tenth of the rows', async () => {
      const result = await generateCycle();

      ok(
        closeTo(
          rateOf(wardenValues(result), (value) => value === null),
          0.1,
        ),
      );
    });

    it('batches the updates at the configured batch size', async () => {
      const result = await generateCycle({ batchSize: 64 });
      const sizes = result.deferredBatches.map((batch) => batch.updates.length);

      deq(sizes, [64, 64, 64, 8]);
    });

    it('honours an override on the deferred column, verbatim', async () => {
      const result = await generateCycle({
        counts: { parks: 3, staff: 4 },
        overrides: { parks: [{ wardenId: 2 }, { wardenId: null }] },
      });

      deq(wardenValues(result).slice(0, 2), [2, null]);
    });

    it('leaves the column null when the referenced table generated nothing', async () => {
      const result = await generateCycle({ counts: { parks: 3, staff: 0 } });

      ok(wardenValues(result).every((value) => value === null));
    });
  });

  describe('a schema whose cycle is not generated', () => {
    it('needs no deferred pass, and no sink support', async () => {
      const written = [];
      const report = await generate(
        {
          schema: parkSchema,
          rules: structuralParkRules,
          counts: { parks: 2 },
          seed: SEED,
          referenceDate: REFERENCE_DATE,
        },
        { writeRows: (table, rows) => written.push([table.key, rows.length]), end: (finished) => finished },
      );

      deq(written, [['parks', 2]]);
      deq(report.rowCounts, { parks: 2 });
    });
  });

  describe('a sink which cannot apply the second pass', () => {
    it('is rejected before a single row reaches it', async () => {
      const written = [];

      await rejects(
        generate(
          {
            schema: parkSchema,
            rules: structuralParkRules,
            counts: { parks: 2, staff: 2 },
            seed: SEED,
          },
          { writeRows: (table) => written.push(table.key), end: (report) => report },
        ),
        {
          name: 'DeferredUpdatesUnsupportedError',
          message:
            'Tables parks and staff form a cycle, which drizzle-super-seed breaks by leaving ' +
            'parks.wardenId until every table has been generated. This sink cannot apply that second ' +
            'pass. Use a sink which implements writeDeferredUpdates, or give createRowBatchSink a ' +
            'deferred update handler.',
          tables: ['parks', 'staff'],
          columns: ['parks.wardenId'],
        },
      );

      deq(written, []);
    });

    it('is what createRowBatchSink returns without a deferred update handler', async () => {
      await rejects(
        generate(
          { schema: parkSchema, rules: structuralParkRules, counts: { parks: 2, staff: 2 }, seed: SEED },
          createRowBatchSink(() => {}),
        ),
        { name: 'DeferredUpdatesUnsupportedError' },
      );
    });
  });

  describe('reproducibility', () => {
    it('replays the deferred pass for the same seed', async () => {
      const [first, second] = [await generateCycle(), await generateCycle()];

      deq(second.rowsByTable, first.rowsByTable);
      deq(second.deferredBatches, first.deferredBatches);
    });

    it('assigns different wardens for a different seed', async () => {
      const [first, second] = [await generateCycle(), await generateCycle({ seed: SEED + 1 })];

      ok(wardenValues(first).join() !== wardenValues(second).join());
    });
  });

  describe('the in memory graph', () => {
    const graphOf = (overrides = {}) => generateCycle({ ...overrides, sink: createInMemoryGraphSink() });

    it('shows the assigned values, never the pass one nulls', async () => {
      const graph = await graphOf({ counts: { parks: 40, staff: 60 } });
      const assigned = graph.rows.parks.filter((park) => park.wardenId !== null);

      ok(assigned.length > 0);
      ok(assigned.every((park) => graph.rows.staff.some((member) => member.id === park.wardenId)));
    });

    it('navigates across the deferred relationship', async () => {
      const graph = await graphOf({ counts: { parks: 40, staff: 60 } });

      for (const park of graph.rows.parks) {
        const warden = graph.parentOf('parks', park, 'wardenId');
        eq(warden === null, park.wardenId === null);
        if (warden) eq(warden.id, park.wardenId);
      }
    });

    it('navigates back from the other side of the cycle', async () => {
      const graph = await graphOf({ counts: { parks: 5, staff: 8 } });

      for (const member of graph.rows.staff) {
        eq(graph.parentOf('staff', member, 'parkId').id, member.parkId);
      }
    });
  });

  describe('the row batch sink', () => {
    it('delivers every update batch after every insert batch', async () => {
      const calls = [];
      await generateCycle({
        batchSize: 32,
        sink: createRowBatchSink(
          (batch) => calls.push(`insert ${batch.tableKey}`),
          (batch) => calls.push(`update ${batch.tableKey} ${batch.columnNames.join()}`),
        ),
      });
      const firstUpdate = calls.findIndex((call) => call.startsWith('update'));

      ok(firstUpdate > 0);
      ok(calls.slice(firstUpdate).every((call) => call.startsWith('update')));
      ok(calls.includes('update parks wardenId'));
    });

    it('names the deferred columns in the batch', async () => {
      const batches = [];
      await generateCycle({
        counts: { parks: 3, staff: 3 },
        sink: createRowBatchSink(
          () => {},
          (batch) => batches.push(batch),
        ),
      });

      eq(batches.length, 1);
      deq(batches[0].columnNames, ['wardenId']);
      eq(batches[0].table, parkSchema.parks);
      eq(batches[0].updates.length, 3);
    });
  });

  describe('per parent counts across the deferred edge', () => {
    it('are rejected, because the parent does not exist yet', async () => {
      await rejects(generateCycle({ counts: { staff: 4, parks: { per: 'staff', count: constant(1) } } }), {
        name: 'InvalidPerParentError',
        message:
          'Table parks is counted per staff row, but parks.wardenId is the foreign key ' +
          'drizzle-super-seed defers to break the cycle between them, so staff rows do not exist ' +
          'while parks generates. Count staff per parks instead, or give parks a fixed count.',
        reason: 'deferredEdge',
        table: 'parks',
        parentTable: 'staff',
        columns: ['wardenId'],
      });
    });

    it('are accepted in the direction which is not deferred', async () => {
      const result = await generateCycle({ counts: { parks: 4, staff: { per: 'parks', count: constant(2) } } });

      eq(rowsOf(result, 'staff').length, 8);
    });
  });

  describe('a cycle which cannot be broken', () => {
    const wings = pgTable('wings', {
      id: integer('id').primaryKey(),
      lodgeId: integer('lodge_id')
        .notNull()
        .references(() => lodges.id),
    });

    const lodges = pgTable('lodges', {
      id: integer('id').primaryKey(),
      wingId: integer('wing_id')
        .notNull()
        .references(() => wings.id),
    });

    it('is still rejected outright', async () => {
      await rejects(
        generate(
          {
            schema: { wings, lodges },
            rules: {
              wings: { id: structuralDefault, lodgeId: structuralDefault },
              lodges: { id: structuralDefault, wingId: structuralDefault },
            },
            counts: { wings: 1, lodges: 1 },
            seed: SEED,
          },
          createRecordingSink(),
        ),
        { name: 'CircularDependencyError' },
      );
    });
  });

  describe('a unique constraint on the deferred column', () => {
    const halls = pgTable(
      'halls',
      {
        id: integer('id').primaryKey(),
        keeperId: integer('keeper_id').references(() => keepers.id),
        name: varchar('name', { length: 40 }).notNull(),
      },
      (table) => [unique('halls_keeper_id_key').on(table.keeperId)],
    );

    const keepers = pgTable('keepers', {
      id: integer('id').primaryKey(),
      hallId: integer('hall_id')
        .notNull()
        .references(() => halls.id),
    });

    const rules = {
      halls: {
        id: derive((row, context) => context.rowIndex + 1),
        keeperId: structuralDefault,
        name: structuralDefault,
      },
      keepers: { id: derive((row, context) => context.rowIndex + 1), hallId: structuralDefault },
    };

    const generateHalls = (counts) =>
      generate({ schema: { halls, keepers }, rules, counts, seed: SEED }, createRecordingSink());

    it('is enforced in the deferred pass', async () => {
      const result = await generateHalls({ halls: 6, keepers: 40 });
      const assigned = deferredUpdatesOf(result, 'halls')
        .map((update) => update.values.keeperId)
        .filter((value) => value !== null);

      eq(new Set(assigned).size, assigned.length);
    });

    it('is exhausted when there are fewer keepers than halls', async () => {
      await rejects(generateHalls({ halls: 40, keepers: 2 }), {
        name: 'UniqueConstraintExhaustedError',
        table: 'halls',
        columns: ['keeperId'],
      });
    });
  });
});
