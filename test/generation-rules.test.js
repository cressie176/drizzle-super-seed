const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, notEqual: notEq, ok, throws } = require('node:assert');
const { integer, numeric, pgTable, uuid, varchar } = require('drizzle-orm/pg-core');
const { extractCanonicalSchema, structuralDefault } = require('../lib');
const { PlanSource, resolveGenerationPlan } = require('../lib/generation-rules');
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

const planFor = (rules, counts, schema = parkSchema) =>
  resolveGenerationPlan(extractCanonicalSchema(schema), rules, counts);

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

  describe('resolveGenerationPlan', () => {
    describe('plan shape', () => {
      it('plans every counted table, in schema order', () => {
        deq(
          [...parkPlan().keys()],
          ['parks', 'pitches', 'owners', 'holidayHomes', 'accessories', 'lettings', 'parkOwners'],
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
        const values = structuralValues('accessories', 'quantity', LARGE_SAMPLE);

        ok(values.every((value) => Number.isInteger(value) && value >= 0 && value <= 1_000_000));
        ok(new Set(values).size > 1);
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
