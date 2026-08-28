const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, notEqual: notEq, ok, throws } = require('node:assert');
const {
  bigint,
  bigserial,
  check,
  date,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} = require('drizzle-orm/pg-core');
const { sql } = require('drizzle-orm');
const { extractCanonicalSchema, structuralDefault } = require('../lib');
const { PlanSource, resolveGenerationPlan } = require('../lib/generation-rules');
const { orderTablesByDependency } = require('../lib/table-dependency-order');
const { REFERENCE_DATE, contextFor, draw } = require('./lib/generator-draws');
const { everyParkTableCounted, structuralParkRules } = require('./lib/park-rules');
const parkSchema = require('./lib/park-schema');

const LARGE_SAMPLE = 10_000;
const RATE_TOLERANCE = 0.02;

const rateOf = (values, matches) => values.filter(matches).length / values.length;

const closeTo = (actual, expected) => Math.abs(actual - expected) <= RATE_TOLERANCE;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DATE_STRING = /^\d{4}-\d{2}-\d{2}$/;
const TIME_STRING = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

// The engine orders the tables before resolving the plan, so that deferred foreign keys are
// exempt from needing a count; the helper does the same.
const planFor = (rules, counts, schema = parkSchema) => {
  const canonical = extractCanonicalSchema(schema);
  return resolveGenerationPlan(canonical, rules, counts, orderTablesByDependency(canonical).deferredForeignKeys);
};

const parkPlan = () => planFor(structuralParkRules, everyParkTableCounted);

const entryFor = (plan, tableKey, propertyName) =>
  plan.get(tableKey).find((entry) => entry.column.propertyName === propertyName);

const generatorFor = (tableKey, propertyName) => entryFor(parkPlan(), tableKey, propertyName).generator;

const structuralValues = (tableKey, propertyName, count) => draw(generatorFor(tableKey, propertyName), count);

const rulesWithout = (tableKey) => {
  const { [tableKey]: removed, ...remaining } = structuralParkRules;
  return remaining;
};

const parkRulesWithout = (propertyName) => {
  const { [propertyName]: removed, ...remaining } = structuralParkRules.parks;
  return { ...structuralParkRules, parks: remaining };
};

const parkRulesWith = (rules) => ({
  ...structuralParkRules,
  parks: { ...structuralParkRules.parks, ...rules },
});

const shortCodes = pgTable('short_codes', {
  id: integer('id').primaryKey(),
  code: varchar('code', { length: 4 }).notNull(),
  amount: numeric('amount').notNull(),
});

const shortCodeRules = {
  shortCodes: { id: structuralDefault, code: structuralDefault, amount: structuralDefault },
};

// A table level primaryKey() makes its members NOT NULL in the database without touching the
// column declarations, so none of these three carries .notNull().
const chunkLinks = pgTable(
  'chunk_links',
  {
    chunkId: uuid('chunk_id'),
    messageId: varchar('message_id', { length: 40 }),
    note: varchar('note', { length: 40 }),
  },
  (table) => [primaryKey({ columns: [table.chunkId, table.messageId] })],
);

const chunkLinkRules = {
  chunkLinks: { chunkId: structuralDefault, messageId: structuralDefault, note: structuralDefault },
};

const everyMode = pgTable('every_mode', {
  id: integer('id').primaryKey(),
  dateAsString: date('date_as_string').notNull(),
  dateAsDate: date('date_as_date', { mode: 'date' }).notNull(),
  timestampAsDate: timestamp('timestamp_as_date').notNull(),
  timestampAsString: timestamp('timestamp_as_string', { mode: 'string' }).notNull(),
  numericAsString: numeric('numeric_as_string').notNull(),
  numericAsNumber: numeric('numeric_as_number', { mode: 'number' }).notNull(),
  numericAsBigInt: numeric('numeric_as_big_int', { mode: 'bigint' }).notNull(),
  bigIntAsNumber: bigint('big_int_as_number', { mode: 'number' }).notNull(),
  bigIntAsBigInt: bigint('big_int_as_big_int', { mode: 'bigint' }).notNull(),
  bigSerialAsBigInt: bigserial('big_serial_as_big_int', { mode: 'bigint' }).notNull(),
});

const everyModeRules = {
  everyMode: {
    id: structuralDefault,
    dateAsString: structuralDefault,
    dateAsDate: structuralDefault,
    timestampAsDate: structuralDefault,
    timestampAsString: structuralDefault,
    numericAsString: structuralDefault,
    numericAsNumber: structuralDefault,
    numericAsBigInt: structuralDefault,
    bigIntAsNumber: structuralDefault,
    bigIntAsBigInt: structuralDefault,
    bigSerialAsBigInt: structuralDefault,
  },
};

const departments = pgTable('departments', {
  id: uuid('id').primaryKey().defaultRandom(),
  parentId: uuid('parent_id')
    .notNull()
    .references(() => departments.id),
});

const departmentRules = { departments: { id: structuralDefault, parentId: structuralDefault } };

describe('generation rules', () => {
  describe('structuralDefault', () => {
    it('is a symbol describing itself', () => {
      eq(typeof structuralDefault, 'symbol');
      eq(structuralDefault.description, 'structuralDefault');
    });

    it('is distinct from any symbol a user could write', () => {
      notEq(structuralDefault, Symbol('structuralDefault'));
      notEq(structuralDefault, Symbol.for('structuralDefault'));
    });

    it('is the same symbol on every require', () => {
      eq(require('../lib').structuralDefault, structuralDefault);
    });
  });

  describe('check constrained columns', () => {
    const deliveries = pgTable(
      'deliveries',
      {
        id: integer('id').primaryKey(),
        state: text('state'),
        sent: integer('sent'),
        total: integer('total'),
        note: text('note'),
      },
      (table) => [
        check('state_known', sql`${table.state} IN ('queued', 'sent')`),
        check('sent_within_total', sql`${table.sent} <= ${table.total}`),
      ],
    );

    const deliveryRules = (overrides) => ({
      deliveries: {
        id: structuralDefault,
        state: structuralDefault,
        sent: structuralDefault,
        total: structuralDefault,
        note: structuralDefault,
        ...overrides,
      },
    });

    const planDeliveries = (overrides) => planFor(deliveryRules(overrides), { deliveries: 1 }, { deliveries });

    it('refuses a structural default for a column a check mentions, naming the constraint', () => {
      throws(() => planDeliveries(), {
        name: 'CheckConstrainedColumnRuleRequiredError',
        table: 'deliveries',
        column: 'state',
        constraint: 'state_known',
      });
    });

    it('quotes the predicate, so the rule to write is visible in the message', () => {
      throws(() => planDeliveries(), {
        message: /state IN \('queued', 'sent'\)/,
      });
    });

    it('refuses every column a check relates, not only the first', () => {
      throws(() => planDeliveries({ state: 'queued' }), {
        column: 'sent',
        constraint: 'sent_within_total',
      });
      throws(() => planDeliveries({ state: 'queued', sent: 1 }), {
        column: 'total',
        constraint: 'sent_within_total',
      });
    });

    it('accepts an explicit rule, and leaves unconstrained columns structural', () => {
      const plan = planDeliveries({ state: 'queued', sent: 1, total: 2 });

      eq(entryFor(plan, 'deliveries', 'note').source, PlanSource.StructuralDefault);
    });
  });

  describe('resolveGenerationPlan', () => {
    describe('plan shape', () => {
      it('plans every counted table, in schema order', () => {
        deq(
          [...parkPlan().keys()],
          ['parks', 'pitches', 'owners', 'holidayHomes', 'accessories', 'lettings', 'parkOwners', 'staff'],
        );
      });

      it('leaves uncounted tables out of the plan', () => {
        deq([...planFor(structuralParkRules, { parks: 1 }).keys()], ['parks']);
      });

      it('resolves every column of a table, in declaration order', () => {
        deq(
          parkPlan()
            .get('lettings')
            .map((entry) => entry.column.propertyName),
          ['id', 'holidayHomeId', 'guestName', 'status', 'startDate', 'endDate', 'arrivalTime', 'siteFee', 'notes'],
        );
      });

      it('carries the canonical column alongside each generator', () => {
        const entry = entryFor(parkPlan(), 'parks', 'name');
        eq(entry.column.name, 'name');
        eq(entry.column.maxLength, 120);
      });

      it('resolves every column of every counted table to exactly one source', () => {
        const sources = Object.values(PlanSource);
        for (const entries of parkPlan().values()) {
          for (const entry of entries) ok(sources.includes(entry.source), `${entry.column.name} has no source`);
        }
      });

      it('evaluates no generator while resolving', () => {
        const generated = () => {
          throw new Error('generated during resolution');
        };

        planFor(parkRulesWith({ name: generated }), everyParkTableCounted);
      });
    });

    describe('rule sources', () => {
      it('takes an explicit generator from the rules', () => {
        const parkName = (context) => `park ${context.rowIndex}`;
        const entry = entryFor(planFor(parkRulesWith({ name: parkName }), everyParkTableCounted), 'parks', 'name');

        eq(entry.source, PlanSource.ExplicitRule);
        eq(entry.generator, parkName);
      });

      it('wraps a literal from the rules as a constant', () => {
        const entry = entryFor(planFor(parkRulesWith({ name: 'Sunny Sands' }), everyParkTableCounted), 'parks', 'name');

        eq(entry.source, PlanSource.Literal);
        deq(draw(entry.generator, 2), ['Sunny Sands', 'Sunny Sands']);
      });

      it('treats a null literal as a rule rather than as a missing one', () => {
        const entry = entryFor(planFor(parkRulesWith({ latitude: null }), everyParkTableCounted), 'parks', 'latitude');

        eq(entry.source, PlanSource.Literal);
        deq(draw(entry.generator, 2), [null, null]);
      });

      it('derives a structural default from the column', () => {
        eq(entryFor(parkPlan(), 'parks', 'name').source, PlanSource.StructuralDefault);
      });

      it('leaves a foreign key to another table to the engine', () => {
        const entry = entryFor(parkPlan(), 'pitches', 'parkId');

        eq(entry.source, PlanSource.EngineManaged);
        eq(entry.generator, null);
      });

      it('lets an explicit rule override a foreign key', () => {
        const rules = { ...structuralParkRules, pitches: { ...structuralParkRules.pitches, parkId: 7 } };
        const entry = entryFor(planFor(rules, everyParkTableCounted), 'pitches', 'parkId');

        eq(entry.source, PlanSource.Literal);
        deq(draw(entry.generator, 2), [7, 7]);
      });

      it('leaves a sequence owned column to the engine', () => {
        const entry = entryFor(parkPlan(), 'pitches', 'id');

        eq(entry.source, PlanSource.EngineManaged);
        deq(draw(entry.generator, 3), [1, 2, 3]);
      });

      it('leaves a generated always identity column to the engine, without a rule', () => {
        const entry = entryFor(parkPlan(), 'parks', 'id');

        eq(entry.source, PlanSource.EngineManaged);
        deq(draw(entry.generator, 3), [1, 2, 3]);
      });
    });

    describe('self references', () => {
      it('resolves a nullable self reference to selfReference()', () => {
        const entry = entryFor(parkPlan(), 'owners', 'referredByOwnerId');

        eq(entry.source, PlanSource.EngineManaged);
        eq(entry.generator({ ...contextFor(), priorSelfReferenceValues: [] }), null);
      });

      it('picks from the rows already generated', () => {
        const generator = generatorFor('owners', 'referredByOwnerId');
        const context = { ...contextFor(), priorSelfReferenceValues: ['first', 'second'] };
        const values = Array.from({ length: LARGE_SAMPLE }, () => generator(context));

        ok(
          closeTo(
            rateOf(values, (value) => value === null),
            0.1,
          ),
        );
        deq(new Set(values), new Set([null, 'first', 'second']));
      });

      it('rejects a not null self reference at resolution time', () => {
        throws(() => planFor(departmentRules, { departments: 1 }, { departments }), {
          name: 'NotNullSelfReferenceError',
          message:
            'Column departments.parentId references its own table and is not null, ' +
            'so the first row generated has nothing to reference. ' +
            'Make departments.parentId nullable, or give it a rule which does not depend on earlier rows.',
          table: 'departments',
          column: 'parentId',
        });
      });
    });

    describe('structural defaults', () => {
      it('generates whole numbers for integer columns', () => {
        const plan = planFor(shortCodeRules, { shortCodes: 1 }, { shortCodes });
        const values = draw(entryFor(plan, 'shortCodes', 'id').generator, LARGE_SAMPLE);

        ok(values.every((value) => Number.isInteger(value) && value >= 0 && value <= 1_000_000));
        ok(values.some((value) => value > 900_000));
      });

      it('keeps within the range of a narrower integer column', () => {
        const values = structuralValues('accessories', 'quantity', LARGE_SAMPLE);

        ok(values.every((value) => Number.isInteger(value) && value >= 0 && value <= 32_767));
        ok(values.some((value) => value > 30_000));
      });

      it('generates whole numbers for bigint columns', () => {
        const values = structuralValues('owners', 'loyaltyPoints', LARGE_SAMPLE);

        ok(values.every((value) => Number.isInteger(value) && value >= 0 && value <= 1_000_000));
      });

      it('generates fractional numbers for real columns', () => {
        const values = structuralValues('pitches', 'areaSqm', LARGE_SAMPLE).filter((value) => value !== null);

        ok(values.every((value) => value >= 0 && value < 1_000_000));
        ok(values.some((value) => !Number.isInteger(value)));
      });

      it('generates decimal strings within the column precision and scale', () => {
        const values = structuralValues('lettings', 'siteFee', LARGE_SAMPLE);

        ok(values.every((value) => /^\d{1,6}\.\d{2}$/.test(value)));
        ok(values.some((value) => value.length === '999999.99'.length));
      });

      it('scales decimal strings to each column separately', () => {
        const values = structuralValues('holidayHomes', 'purchasePrice', LARGE_SAMPLE).filter(
          (value) => value !== null,
        );

        ok(values.every((value) => /^\d{1,8}\.\d{2}$/.test(value)));
        ok(values.some((value) => value.length === '99999999.99'.length));
      });

      it('generates text within the column maximum length', () => {
        const values = structuralValues('pitches', 'reference', LARGE_SAMPLE);

        ok(values.every((value) => value.length >= 8 && value.length <= 20));
        ok(values.some((value) => value.length === 20));
      });

      it('shortens text below the default minimum length when the column is narrower', () => {
        const plan = planFor(shortCodeRules, { shortCodes: 1 }, { shortCodes });
        const values = draw(entryFor(plan, 'shortCodes', 'code').generator, LARGE_SAMPLE);

        ok(values.every((value) => value.length === 4));
      });

      it('generates text up to a default length when the column is unbounded', () => {
        const values = structuralValues('holidayHomes', 'model', LARGE_SAMPLE).filter((value) => value !== null);

        ok(values.every((value) => value.length >= 8 && value.length <= 32));
        ok(values.some((value) => value.length === 32));
      });

      it('generates decimal strings for a numeric column with no declared precision', () => {
        const plan = planFor(shortCodeRules, { shortCodes: 1 }, { shortCodes });
        const values = draw(entryFor(plan, 'shortCodes', 'amount').generator, LARGE_SAMPLE);

        ok(values.every((value) => /^\d{1,8}\.\d{2}$/.test(value)));
      });

      it('generates both booleans', () => {
        const values = structuralValues('parks', 'active', LARGE_SAMPLE);

        ok(
          closeTo(
            rateOf(values, (value) => value === true),
            0.5,
          ),
        );
      });

      it('generates version four uuids', () => {
        const values = structuralValues('owners', 'id', LARGE_SAMPLE);

        ok(values.every((value) => UUID_V4.test(value)));
      });

      it('generates date strings within five years of the reference date', () => {
        const values = structuralValues('parks', 'openedAt', LARGE_SAMPLE);

        ok(values.every((value) => DATE_STRING.test(value)));
        ok(values.every((value) => value >= '2019-06-01' && value <= '2024-06-01'));
      });

      it('generates timestamps within five years of the reference date', () => {
        const values = structuralValues('parks', 'createdAt', LARGE_SAMPLE);

        ok(values.every((value) => value instanceof Date));
        ok(values.every((value) => value <= REFERENCE_DATE && value >= new Date('2019-06-01T00:00:00.000Z')));
      });

      it('generates times across the whole day', () => {
        const values = structuralValues('lettings', 'arrivalTime', LARGE_SAMPLE);

        ok(values.every((value) => TIME_STRING.test(value)));
        ok(values.some((value) => value < '01:00:00'));
        ok(values.some((value) => value > '23:00:00'));
      });

      it('generates an empty object for json columns', () => {
        const values = structuralValues('holidayHomes', 'specification', LARGE_SAMPLE).filter(
          (value) => value !== null,
        );

        ok(values.every((value) => Object.keys(value).length === 0));
        notEq(values[0], values[1]);
      });

      it('generates only declared values for enum columns', () => {
        const values = structuralValues('lettings', 'status', LARGE_SAMPLE);

        deq([...new Set(values)].sort(), ['cancelled', 'confirmed', 'pending']);
      });

      it('generates null for a tenth of the rows of a nullable column', () => {
        const values = structuralValues('parks', 'latitude', LARGE_SAMPLE);

        ok(
          closeTo(
            rateOf(values, (value) => value === null),
            0.1,
          ),
        );
      });

      it('never generates null for a not null column', () => {
        const values = structuralValues('parks', 'name', LARGE_SAMPLE);

        ok(values.every((value) => typeof value === 'string'));
      });
    });

    describe('declared representations', () => {
      const modeValues = (propertyName, count) => {
        const plan = planFor(everyModeRules, { everyMode: 1 }, { everyMode });
        return draw(entryFor(plan, 'everyMode', propertyName).generator, count);
      };

      const withinFiveYears = (date) => date <= REFERENCE_DATE && date >= new Date('2019-06-01T00:00:00.000Z');

      it('generates a date column as the string drizzle inserts by default', () => {
        const values = modeValues('dateAsString', LARGE_SAMPLE);

        ok(values.every((value) => DATE_STRING.test(value)));
      });

      it('generates a date column declared mode date as a Date', () => {
        const values = modeValues('dateAsDate', LARGE_SAMPLE);

        ok(values.every((value) => value instanceof Date && withinFiveYears(value)));
      });

      it('generates a timestamp column as the Date drizzle inserts by default', () => {
        const values = modeValues('timestampAsDate', LARGE_SAMPLE);

        ok(values.every((value) => value instanceof Date && withinFiveYears(value)));
      });

      it('generates a timestamp column declared mode string as an iso string', () => {
        const values = modeValues('timestampAsString', LARGE_SAMPLE);

        ok(values.every((value) => typeof value === 'string'));
        ok(values.every((value) => withinFiveYears(new Date(value))));
        ok(values.every((value) => new Date(value).toISOString() === value));
      });

      it('generates a numeric column as the string drizzle inserts by default', () => {
        const values = modeValues('numericAsString', LARGE_SAMPLE);

        ok(values.every((value) => /^\d{1,8}\.\d{2}$/.test(value)));
      });

      it('generates a numeric column declared mode number as a number', () => {
        const values = modeValues('numericAsNumber', LARGE_SAMPLE);

        ok(values.every((value) => typeof value === 'number' && value >= 0 && value < 100_000_000));
        ok(values.every((value) => /^\d+(\.\d{1,2})?$/.test(String(value))));
        ok(values.some((value) => !Number.isInteger(value)));
      });

      it('generates a numeric column declared mode bigint as a bigint', () => {
        const values = modeValues('numericAsBigInt', LARGE_SAMPLE);

        ok(values.every((value) => typeof value === 'bigint' && value >= 0n && value < 100_000_000n));
      });

      it('generates a bigint column declared mode number as a number', () => {
        const values = modeValues('bigIntAsNumber', LARGE_SAMPLE);

        ok(values.every((value) => Number.isInteger(value) && value >= 0 && value <= 1_000_000));
      });

      it('generates a bigint column declared mode bigint as a bigint', () => {
        const values = modeValues('bigIntAsBigInt', LARGE_SAMPLE);

        ok(values.every((value) => typeof value === 'bigint' && value >= 0n && value <= 1_000_000n));
      });

      it('counts a bigserial sequence in bigints', () => {
        deq(modeValues('bigSerialAsBigInt', 3), [1n, 2n, 3n]);
      });

      it('counts a serial sequence in numbers', () => {
        deq(structuralValues('pitches', 'id', 3), [1, 2, 3]);
      });
    });

    describe('validation', () => {
      it('rejects a count for a table the schema does not have', () => {
        throws(() => planFor(structuralParkRules, { ...everyParkTableCounted, cottages: 1 }), {
          name: 'UnknownCountTableError',
          message:
            'Counts include table cottages, which the schema does not have. ' +
            'Correct the table name, or add cottages to the schema passed to generate.',
          table: 'cottages',
        });
      });

      it('rejects a counted table with no rules object', () => {
        throws(() => planFor(rulesWithout('pitches'), everyParkTableCounted), {
          name: 'MissingTableRulesError',
          message:
            'Table pitches has a count but no rules object, ' +
            'so drizzle-super-seed does not know what to put in its columns. ' +
            'Add a rules object for pitches, or remove it from counts.',
          table: 'pitches',
        });
      });

      it('accepts an uncounted table with no rules object', () => {
        deq([...planFor(rulesWithout('pitches'), { parks: 1 }).keys()], ['parks']);
      });

      it('rejects a rules object which omits a not null column', () => {
        throws(() => planFor(parkRulesWithout('region'), everyParkTableCounted), {
          name: 'MissingColumnRuleError',
          message:
            'The rules for table parks have no rule for column region. ' +
            'Add one, or write region: structuralDefault to accept the derived default.',
          table: 'parks',
          column: 'region',
        });
      });

      it('rejects a rules object which omits a nullable column', () => {
        throws(() => planFor(parkRulesWithout('latitude'), everyParkTableCounted), {
          name: 'MissingColumnRuleError',
          message:
            'The rules for table parks have no rule for column latitude. ' +
            'Add one, or write latitude: structuralDefault to accept the derived default.',
          table: 'parks',
          column: 'latitude',
        });
      });

      it('rejects a rule for a column the table does not have', () => {
        throws(() => planFor(parkRulesWith({ postcode: structuralDefault }), everyParkTableCounted), {
          name: 'UnknownColumnRuleError',
          message:
            'The rules for table parks have a rule for column postcode, which parks does not have. ' +
            'Correct the column name, or remove the rule.',
          table: 'parks',
          column: 'postcode',
        });
      });

      it('rejects an engine managed foreign key to a table with no count', () => {
        throws(() => planFor(structuralParkRules, { pitches: 1 }), {
          name: 'MissingParentCountError',
          message:
            'Column pitches.parkId references table parks, which has no count, so there are no rows to reference. ' +
            'Add a count for parks, or give pitches.parkId a rule of its own.',
          table: 'pitches',
          column: 'parkId',
          parentTable: 'parks',
        });
      });

      it('accepts a foreign key with a rule of its own to a table with no count', () => {
        const rules = { ...structuralParkRules, pitches: { ...structuralParkRules.pitches, parkId: 7 } };

        deq([...planFor(rules, { pitches: 1 }).keys()], ['pitches']);
      });
    });
  });
});
