const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, notDeepEqual: notDeq, ok, rejects } = require('node:assert');
const { integer, pgTable, serial, text } = require('drizzle-orm/pg-core');
const { derive, extractCanonicalSchema, generate, selfReference, structuralDefault } = require('../lib');
const { everyParkTableCounted, structuralParkRules } = require('./lib/park-rules');
const parkSchema = require('./lib/park-schema');
const { createRecordingSink, rowsOf, valuesOf } = require('./lib/recording-sink');

const SEED = 42;
const REFERENCE_DATE = new Date('2024-06-01T00:00:00.000Z');
const RATE_TOLERANCE = 0.03;

const SMALL_COUNTS = {
  parks: 3,
  pitches: 5,
  owners: 7,
  holidayHomes: 6,
  accessories: 4,
  lettings: 5,
  parkOwners: 6,
};

const rateOf = (values, matches) => values.filter(matches).length / values.length;

const closeTo = (actual, expected) => Math.abs(actual - expected) <= RATE_TOLERANCE;

const generateParks = (overrides = {}) =>
  generate(
    {
      schema: parkSchema,
      rules: structuralParkRules,
      counts: SMALL_COUNTS,
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

const propertyNameOf = (table, columnName) => table.columns.find((column) => column.name === columnName).propertyName;

const foreignKeyViolations = (result) => {
  const schema = extractCanonicalSchema(parkSchema);
  const violations = [];
  for (const table of schema.tables.values()) {
    for (const foreignKey of table.foreignKeys) {
      const parent = schema.tables.get(foreignKey.referencedTableKey);
      const parentValues = new Set(
        valuesOf(result, parent.key, propertyNameOf(parent, foreignKey.referencedColumnName)),
      );
      const childProperty = propertyNameOf(table, foreignKey.columnName);
      for (const row of rowsOf(result, table.key)) {
        if (row[childProperty] === null || parentValues.has(row[childProperty])) continue;
        violations.push(`${table.key}.${childProperty} references missing ${parent.key} ${row[childProperty]}`);
      }
    }
  }
  return violations;
};

const tupleKeys = (result, tableKey, propertyNames) =>
  rowsOf(result, tableKey).map((row) => propertyNames.map((propertyName) => String(row[propertyName])).join(' '));

const beginOrder = (result) =>
  result.calls.filter((call) => call.startsWith('beginTable ')).map((call) => call.split(' ')[1]);

const batchSizesOf = (result, tableKey) =>
  result.batches.filter((batch) => batch.tableKey === tableKey).map((batch) => batch.rows.length);

const wardens = pgTable('wardens', {
  id: serial('id').primaryKey(),
  parkId: integer('park_id').references(() => parkSchema.parks.id),
  note: text('note').notNull(),
});

const wardensWithoutParent = pgTable('wardens', {
  id: serial('id').primaryKey(),
  note: text('note').notNull(),
});

const strictWardens = pgTable('strict_wardens', {
  id: serial('id').primaryKey(),
  parkId: integer('park_id')
    .notNull()
    .references(() => parkSchema.parks.id),
  note: text('note').notNull(),
});

const wardenRules = { id: structuralDefault, parkId: structuralDefault, note: structuralDefault };

describe('generation engine', () => {
  describe('the park fixture', () => {
    it('gives every foreign key a parent which exists', async () => {
      deq(foreignKeyViolations(await generateParks()), []);
    });

    it('keeps the rows of a composite primary key table distinct', async () => {
      const keys = tupleKeys(await generateParks(), 'parkOwners', ['parkId', 'ownerId']);

      eq(new Set(keys).size, keys.length);
    });

    it('honours a composite unique constraint', async () => {
      const keys = tupleKeys(await generateParks(), 'lettings', ['holidayHomeId', 'startDate']);

      eq(new Set(keys).size, keys.length);
    });

    it('writes the tables to the sink in dependency order', async () => {
      deq(beginOrder(await generateParks()), [
        'parks',
        'pitches',
        'owners',
        'holidayHomes',
        'accessories',
        'lettings',
        'parkOwners',
      ]);
    });

    it('opens and closes every table exactly once', async () => {
      const result = await generateParks({ counts: { parks: 2 } });

      deq(result.calls, ['beginTable parks', 'writeRows parks 2', 'endTable parks', 'end']);
    });

    it('reports the number of rows it generated for each table', async () => {
      const result = await generateParks();

      deq(result.report.rowCounts, SMALL_COUNTS);
      for (const [tableKey, count] of Object.entries(SMALL_COUNTS)) eq(rowsOf(result, tableKey).length, count);
    });

    it('generates nothing for a table counted at zero, but still opens and closes it', async () => {
      const result = await generateParks({ counts: { parks: 0 } });

      deq(result.calls, ['beginTable parks', 'endTable parks', 'end']);
      deq(result.report.rowCounts, { parks: 0 });
    });

    it('leaves uncounted tables out of the run entirely', async () => {
      const result = await generateParks({ counts: { parks: 1, owners: 1 } });

      deq(beginOrder(result), ['parks', 'owners']);
    });
  });

  describe('batching', () => {
    it('fills every batch but the last', async () => {
      const result = await generateParks({ batchSize: 2 });

      deq(batchSizesOf(result, 'owners'), [2, 2, 2, 1]);
      deq(batchSizesOf(result, 'holidayHomes'), [2, 2, 2]);
    });

    it('writes a single batch when the table fits in one', async () => {
      deq(batchSizesOf(await generateParks({ batchSize: 100 }), 'owners'), [7]);
    });

    it('batches a thousand rows at a time by default', async () => {
      const result = await generateParks({ counts: { parks: 1, owners: 1_500 } });

      deq(batchSizesOf(result, 'owners'), [1_000, 500]);
    });
  });

  describe('reproducibility', () => {
    it('generates identical rows for the same seed', async () => {
      const [first, second] = [await generateParks(), await generateParks()];

      deq(second.rowsByTable, first.rowsByTable);
    });

    it('generates different rows for a different seed', async () => {
      const [first, second] = [await generateParks(), await generateParks({ seed: SEED + 1 })];

      notDeq(second.rowsByTable, first.rowsByTable);
    });

    it('reports the seed it invented, and reproduces the run from it', async () => {
      const invented = await generateParks({ seed: undefined });
      const replayed = await generateParks({ seed: invented.report.seed });

      ok(Number.isInteger(invented.report.seed));
      deq(replayed.rowsByTable, invented.rowsByTable);
    });

    it('invents a different seed each time it is left out', async () => {
      const [first, second] = [await generateParks({ seed: undefined }), await generateParks({ seed: undefined })];

      ok(first.report.seed !== second.report.seed);
    });

    it('reports the reference date it was given', async () => {
      eq((await generateParks()).report.referenceDate, REFERENCE_DATE);
    });

    it('reports the run start as the reference date when none is given', async () => {
      const before = new Date();
      const { report } = await generateParks({ referenceDate: undefined });

      ok(report.referenceDate >= before && report.referenceDate <= new Date());
    });

    it('reports how long the run took', async () => {
      const { report } = await generateParks();

      ok(Number.isInteger(report.durationMs) && report.durationMs >= 0);
    });
  });

  describe('lookups', () => {
    const postcodes = ['TR8 4LW', 'LL55 4UW'];

    const generateWithPostcodes = (loaded) =>
      generateParks({
        counts: { parks: 5 },
        lookups: { postcodes: loaded },
        rules: rulesFor('parks', {
          region: derive((_row, context) => context.random.pick(context.lookups.postcodes)),
        }),
      });

    it('awaits a lookup once and exposes it to every row', async () => {
      let loads = 0;
      const result = await generateWithPostcodes(async () => {
        loads += 1;
        return postcodes;
      });

      eq(loads, 1);
      ok(valuesOf(result, 'parks', 'region').every((region) => postcodes.includes(region)));
    });

    it('exposes no lookups when the config declares none', async () => {
      const result = await generateParks({
        counts: { parks: 1 },
        rules: rulesFor('parks', { region: derive((_row, context) => JSON.stringify(context.lookups)) }),
      });

      deq(valuesOf(result, 'parks', 'region'), ['{}']);
    });
  });

  describe('empty parent pools', () => {
    it('rejects a not null foreign key whose parent generated no rows', async () => {
      await rejects(
        generate(
          {
            schema: { parks: parkSchema.parks, strictWardens },
            rules: { parks: structuralParkRules.parks, strictWardens: wardenRules },
            counts: { parks: 0, strictWardens: 2 },
            seed: SEED,
            referenceDate: REFERENCE_DATE,
          },
          createRecordingSink(),
        ),
        {
          name: 'EmptyParentPoolError',
          message:
            'Column strictWardens.parkId is a not null foreign key to table parks, ' +
            'which generated no rows with seed 42, so there is nothing for it to reference. ' +
            'Raise the count for parks above zero, or make strictWardens.parkId nullable.',
          table: 'strictWardens',
          column: 'parkId',
          parentTable: 'parks',
          seed: SEED,
        },
      );
    });

    it('leaves a nullable foreign key null when its parent generated no rows', async () => {
      const result = await generate(
        {
          schema: { parks: parkSchema.parks, wardens },
          rules: { parks: structuralParkRules.parks, wardens: wardenRules },
          counts: { parks: 0, wardens: 3 },
          seed: SEED,
          referenceDate: REFERENCE_DATE,
        },
        createRecordingSink(),
      );

      deq(valuesOf(result, 'wardens', 'parkId'), [null, null, null]);
    });

    it('draws nothing from the random source for a foreign key with no parent to pick', async () => {
      const withParent = await generate(
        {
          schema: { parks: parkSchema.parks, wardens },
          rules: { parks: structuralParkRules.parks, wardens: wardenRules },
          counts: { parks: 0, wardens: 3 },
          seed: SEED,
          referenceDate: REFERENCE_DATE,
        },
        createRecordingSink(),
      );
      const withoutParent = await generate(
        {
          schema: { wardens: wardensWithoutParent },
          rules: { wardens: { id: structuralDefault, note: structuralDefault } },
          counts: { wardens: 3 },
          seed: SEED,
          referenceDate: REFERENCE_DATE,
        },
        createRecordingSink(),
      );

      deq(valuesOf(withParent, 'wardens', 'note'), valuesOf(withoutParent, 'wardens', 'note'));
    });
  });

  describe('self references', () => {
    const MANY_OWNERS = { parks: 1, owners: 1_000 };

    const generateOwners = (overrides = {}) => generateParks({ counts: MANY_OWNERS, ...overrides });

    it('leaves the first row with nothing to reference', async () => {
      const [first] = rowsOf(await generateOwners(), 'owners');

      eq(first.referredByOwnerId, null);
    });

    it('references only rows generated earlier', async () => {
      const owners = rowsOf(await generateOwners(), 'owners');
      const seen = new Set();

      for (const owner of owners) {
        ok(owner.referredByOwnerId === null || seen.has(owner.referredByOwnerId));
        seen.add(owner.id);
      }
    });

    it('references nothing for a tenth of the rows', async () => {
      const values = valuesOf(await generateOwners(), 'owners', 'referredByOwnerId');

      ok(
        closeTo(
          rateOf(values, (value) => value === null),
          0.1,
        ),
      );
    });

    it('honours a rule which sets its own null probability', async () => {
      const result = await generateOwners({
        rules: rulesFor('owners', { referredByOwnerId: selfReference({ nullProbability: 0.5 }) }),
      });
      const values = valuesOf(result, 'owners', 'referredByOwnerId');

      ok(
        closeTo(
          rateOf(values, (value) => value === null),
          0.5,
        ),
      );
    });

    it('offers the rows generated so far to an explicit rule too', async () => {
      const offered = [];
      await generateParks({
        counts: { parks: 1, owners: 4 },
        rules: rulesFor('owners', {
          referredByOwnerId: derive((_row, context) => {
            offered.push([...context.priorSelfReferenceValues]);
            return null;
          }),
        }),
      });

      deq(
        offered.map((values) => values.length),
        [0, 1, 2, 3],
      );
    });

    it('offers prior values to no other column', async () => {
      const offered = [];
      await generateParks({
        counts: { parks: 1, owners: 4 },
        rules: rulesFor('owners', {
          fullName: derive((_row, context) => {
            offered.push('priorSelfReferenceValues' in context);
            return 'Sam Kerrigan';
          }),
        }),
      });

      deq(offered, [false, false, false, false]);
    });
  });

  describe('unique constraints', () => {
    it('retries the constraint columns until the row is distinct', async () => {
      const result = await generateParks({ counts: { parks: 1, owners: 2, parkOwners: 2 } });
      const keys = tupleKeys(result, 'parkOwners', ['parkId', 'ownerId']);

      eq(new Set(keys).size, 2);
    });

    it('rejects a constraint whose value space is smaller than the row count', async () => {
      await rejects(generateParks({ counts: { parks: 1, owners: 2, parkOwners: 3 } }), {
        name: 'UniqueConstraintExhaustedError',
        message:
          'Could not generate a row of parkOwners satisfying the unique constraint on parkId, ownerId ' +
          'in 100 attempts with seed 42. ' +
          'Widen the range of values its columns can produce, or generate fewer rows.',
        table: 'parkOwners',
        columns: ['parkId', 'ownerId'],
        attempts: 100,
        seed: SEED,
      });
    });

    it('names a single column constraint by its property name', async () => {
      await rejects(
        generateParks({
          counts: { parks: 1, owners: 3 },
          rules: rulesFor('owners', { email: 'sam@example.com' }),
        }),
        {
          name: 'UniqueConstraintExhaustedError',
          table: 'owners',
          columns: ['email'],
          seed: SEED,
        },
      );
    });
  });

  describe('column order', () => {
    it('rejects a rule which reads a column generated later', async () => {
      await rejects(
        generateParks({
          counts: { parks: 1 },
          rules: rulesFor('parks', { name: derive((row) => String(row.region)) }),
        }),
        {
          name: 'ColumnOrderError',
          message:
            'The rule for column parks.name read column region, ' +
            'which has not been generated yet with seed 42. ' +
            'Columns are generated in declaration order, so declare region before name, ' +
            'or derive name from a column which already precedes it.',
          table: 'parks',
          column: 'name',
          readColumn: 'region',
          seed: SEED,
        },
      );
    });

    it('allows a rule to read a column generated earlier', async () => {
      const result = await generateParks({
        counts: { parks: 1 },
        rules: rulesFor('parks', { region: derive((row) => `region of ${row.name}`) }),
      });
      const [park] = rowsOf(result, 'parks');

      eq(park.region, `region of ${park.name}`);
    });

    it('reads anything which is not a column of the table as undefined', async () => {
      const result = await generateParks({
        counts: { parks: 1 },
        rules: rulesFor('parks', { region: derive((row) => String(row.postcode)) }),
      });

      deq(valuesOf(result, 'parks', 'region'), ['undefined']);
    });
  });

  describe('the sink contract', () => {
    it('resolves to whatever the sink returns from end', async () => {
      const report = await generate(
        { schema: parkSchema, rules: structuralParkRules, counts: { parks: 2 }, seed: SEED },
        { writeRows: () => {}, end: (finished) => finished },
      );

      deq(report.rowCounts, { parks: 2 });
    });

    it('needs neither beginTable nor endTable', async () => {
      const written = [];
      await generate(
        { schema: parkSchema, rules: structuralParkRules, counts: { parks: 2 }, seed: SEED },
        { writeRows: (table, rows) => written.push([table.key, rows.length]), end: () => {} },
      );

      deq(written, [['parks', 2]]);
    });

    it('awaits every hook the sink makes asynchronous', async () => {
      const calls = [];
      const settle = async (call) => {
        await Promise.resolve();
        calls.push(call);
      };
      await generate(
        {
          schema: parkSchema,
          rules: structuralParkRules,
          counts: { parks: 3 },
          seed: SEED,
          batchSize: 2,
        },
        {
          beginTable: (table) => settle(`beginTable ${table.key}`),
          writeRows: (table, rows) => settle(`writeRows ${table.key} ${rows.length}`),
          endTable: (table) => settle(`endTable ${table.key}`),
          end: () => settle('end'),
        },
      );

      deq(calls, ['beginTable parks', 'writeRows parks 2', 'writeRows parks 1', 'endTable parks', 'end']);
    });

    it('hands each batch to the sink before generating the next', async () => {
      const seen = [];
      await generate(
        { schema: parkSchema, rules: structuralParkRules, counts: { parks: 3 }, seed: SEED, batchSize: 1 },
        {
          writeRows: (_table, rows) => seen.push(rows.map((row) => row.id)),
          end: () => {},
        },
      );

      deq(seen, [[1], [2], [3]]);
    });
  });

  describe('every counted table', () => {
    it('generates every table of the fixture at once', async () => {
      const result = await generateParks({ counts: everyParkTableCounted });

      deq(result.report.rowCounts, everyParkTableCounted);
      deq(foreignKeyViolations(result), []);
    });
  });
});
