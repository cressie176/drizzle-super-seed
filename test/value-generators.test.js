const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, notEqual: notEq, ok, throws } = require('node:assert');
const { createRandomSource } = require('../lib/random-source');
const { REFERENCE_DATE, SEED, contextFor, draw } = require('./lib/generator-draws');
const {
  constant,
  derive,
  optional,
  pickFrom,
  randomBoolean,
  randomDateBetween,
  randomDecimalString,
  randomInteger,
  randomTimestampWithinYears,
  randomUuid,
  randomWords,
  sequence,
  unique,
} = require('../lib');

const LARGE_SAMPLE = 10_000;
const RATE_TOLERANCE = 0.02;

const timesOf = (dates) => dates.map((date) => date.getTime());

const isoOf = (dates) => dates.map((date) => date.toISOString());

const rateOf = (values, matches) => values.filter(matches).length / values.length;

const closeTo = (actual, expected) => Math.abs(actual - expected) <= RATE_TOLERANCE;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('value generators', () => {
  describe('constant', () => {
    it('emits the same value for every row', () => {
      deq(draw(constant('south-west'), 3), ['south-west', 'south-west', 'south-west']);
    });

    it('emits the identical reference rather than a copy', () => {
      const amenities = { electricity: true };
      const [first, second] = draw(constant(amenities), 2);
      eq(first, amenities);
      eq(second, amenities);
    });

    it('draws nothing from the random source', () => {
      const context = contextFor();
      constant(1)(context);
      eq(context.random.next(), createRandomSource(SEED).next());
    });
  });

  describe('randomInteger', () => {
    it('pins the integers a seed produces', () => {
      deq(draw(randomInteger(1, 100), 5), [61, 45, 86, 67, 18]);
    });

    it('treats both bounds as inclusive', () => {
      const values = draw(randomInteger(3, 9), LARGE_SAMPLE);
      deq(
        [...new Set(values)].sort((a, b) => a - b),
        [3, 4, 5, 6, 7, 8, 9],
      );
    });

    it('emits only integers within the range over a large sample', () => {
      const values = draw(randomInteger(-5, 5), LARGE_SAMPLE);
      ok(
        values.every((value) => Number.isInteger(value) && value >= -5 && value <= 5),
        'every value should be an integer within [-5, 5]',
      );
    });
  });

  describe('randomDecimalString', () => {
    it('pins the decimal strings a seed produces', () => {
      deq(draw(randomDecimalString(0, 100, 2), 5), ['60.11', '44.83', '85.25', '66.97', '17.48']);
    });

    it('carries the exact scale over a large sample', () => {
      const values = draw(randomDecimalString(0, 1, 4), LARGE_SAMPLE);
      ok(
        values.every((value) => /^\d\.\d{4}$/.test(value)),
        'every value should carry exactly four decimal places',
      );
    });

    it('emits no decimal point at a scale of zero', () => {
      const values = draw(randomDecimalString(1, 9, 0), LARGE_SAMPLE);
      ok(
        values.every((value) => /^\d$/.test(value)),
        'every value should be a bare integer string',
      );
    });

    it('stays within the range over a large sample', () => {
      const values = draw(randomDecimalString(-10, 10, 3), LARGE_SAMPLE);
      ok(
        values.every((value) => Number(value) >= -10 && Number(value) <= 10),
        'every value should fall within [-10, 10]',
      );
    });
  });

  describe('randomBoolean', () => {
    it('pins the booleans a seed produces', () => {
      deq(draw(randomBoolean(), 8), [false, true, false, false, true, false, true, false]);
    });

    it('defaults to an even split', () => {
      const values = draw(randomBoolean(), LARGE_SAMPLE);
      ok(closeTo(rateOf(values, Boolean), 0.5), 'about half the values should be true');
    });

    it('honours the configured probability', () => {
      const values = draw(randomBoolean(0.75), LARGE_SAMPLE);
      ok(closeTo(rateOf(values, Boolean), 0.75), 'about three quarters of the values should be true');
    });

    it('never varies at the extremes', () => {
      deq([...new Set(draw(randomBoolean(1), 100))], [true]);
      deq([...new Set(draw(randomBoolean(0), 100))], [false]);
    });
  });

  describe('randomWords', () => {
    it('pins the words a seed produces', () => {
      deq(draw(randomWords(), 5), [
        'wofiho lewohamop lubibe',
        'tiba muji',
        'nig fetu',
        'heco suculud bem yas',
        'samu ziy nepese wozuli coho civ',
      ]);
    });

    it('honours the default length bounds over a large sample', () => {
      const values = draw(randomWords(), LARGE_SAMPLE);
      ok(
        values.every((value) => value.length >= 8 && value.length <= 32),
        'every value should be between 8 and 32 characters long',
      );
    });

    it('honours configured length bounds over a large sample', () => {
      const values = draw(randomWords({ minLength: 3, maxLength: 5 }), LARGE_SAMPLE);
      ok(
        values.every((value) => value.length >= 3 && value.length <= 5),
        'every value should be between 3 and 5 characters long',
      );
      ok(new Set(values.map((value) => value.length)).size > 1, 'the lengths should vary within the bounds');
    });

    it('emits lowercase words separated by single spaces', () => {
      const values = draw(randomWords({ minLength: 1, maxLength: 60 }), LARGE_SAMPLE);
      ok(
        values.every((value) => /^[a-z]+( [a-z]+)*$/.test(value)),
        'every value should be lowercase words separated by single spaces',
      );
    });
  });

  describe('randomUuid', () => {
    it('pins the uuids a seed produces', () => {
      deq(draw(randomUuid(), 3), [
        '9972daab-2c86-459f-9d78-3fe1be4e3280',
        'af9c0078-d60d-4708-840f-2fc887062cd7',
        '7ccf5173-090d-4e98-bea5-354dbddb8234',
      ]);
    });

    it('emits version four uuids', () => {
      const values = draw(randomUuid(), 1_000);
      ok(
        values.every((value) => UUID_V4.test(value)),
        'every value should be a version four uuid',
      );
    });
  });

  describe('randomDateBetween', () => {
    const from = new Date('2000-01-01T00:00:00.000Z');
    const to = new Date('2020-12-31T00:00:00.000Z');

    it('pins the dates a seed produces', () => {
      deq(isoOf(draw(randomDateBetween(from, to), 4)), [
        '2012-08-15T11:10:43.152Z',
        '2009-05-31T09:19:33.960Z',
        '2017-11-25T09:54:11.756Z',
        '2014-01-23T20:38:32.453Z',
      ]);
    });

    it('stays within the range over a large sample', () => {
      const values = timesOf(draw(randomDateBetween(from, to), LARGE_SAMPLE));
      ok(
        values.every((time) => time >= from.getTime() && time <= to.getTime()),
        'every date should fall within the configured range',
      );
    });

    it('emits the single date an empty range allows', () => {
      deq(isoOf(draw(randomDateBetween(from, from), 100)), Array(100).fill(from.toISOString()));
    });
  });

  describe('randomTimestampWithinYears', () => {
    it('pins the timestamps a seed produces', () => {
      deq(isoOf(draw(randomTimestampWithinYears(5), 4)), [
        '2022-06-03T05:11:50.331Z',
        '2021-08-28T00:38:39.951Z',
        '2023-09-05T10:55:12.406Z',
        '2022-10-06T14:29:53.696Z',
      ]);
    });

    it('stays within the years preceding the reference date', () => {
      const earliest = new Date('2019-06-01T00:00:00.000Z').getTime();
      const values = timesOf(draw(randomTimestampWithinYears(5), LARGE_SAMPLE));
      ok(
        values.every((time) => time >= earliest && time <= REFERENCE_DATE.getTime()),
        'every timestamp should fall within the five years before the reference date',
      );
    });

    it('measures from the context reference date rather than the clock', () => {
      const referenceDate = new Date('1990-01-01T00:00:00.000Z');
      const values = timesOf(draw(randomTimestampWithinYears(1), LARGE_SAMPLE, { referenceDate }));
      const earliest = new Date('1989-01-01T00:00:00.000Z').getTime();
      ok(
        values.every((time) => time >= earliest && time <= referenceDate.getTime()),
        'every timestamp should be measured from the reference date',
      );
    });
  });

  describe('pickFrom', () => {
    const regions = ['north', 'south', 'east', 'west'];

    it('pins the picks a seed produces', () => {
      deq(draw(pickFrom(regions), 6), ['east', 'south', 'west', 'east', 'north', 'east']);
    });

    it('picks every item and nothing else over a large sample', () => {
      const values = draw(pickFrom(regions), LARGE_SAMPLE);
      deq([...new Set(values)].sort(), [...regions].sort());
    });

    it('emits the only item of a single item list', () => {
      deq([...new Set(draw(pickFrom(['only']), 100))], ['only']);
    });
  });

  describe('optional', () => {
    it('pins the values a seed produces', () => {
      deq(draw(optional(randomInteger(1, 9)), 10), [5, 7, 5, 6, 5, 8, 3, 5, 6, null]);
    });

    it('defaults to a null rate of one in ten', () => {
      const values = draw(optional(randomInteger(1, 9)), LARGE_SAMPLE);
      ok(
        closeTo(
          rateOf(values, (value) => value === null),
          0.1,
        ),
        'about one value in ten should be null',
      );
    });

    it('honours the configured null probability', () => {
      const values = draw(optional(randomInteger(1, 9), 0.75), LARGE_SAMPLE);
      ok(
        closeTo(
          rateOf(values, (value) => value === null),
          0.75,
        ),
        'about three values in four should be null',
      );
    });

    it('never varies at the extremes', () => {
      deq([...new Set(draw(optional(constant('present'), 0), 100))], ['present']);
      deq([...new Set(draw(optional(constant('present'), 1), 100))], [null]);
    });

    it('passes the row context to the wrapped generator', () => {
      deq(
        draw(
          optional(
            sequence((index) => index),
            0,
          ),
          4,
        ),
        [0, 1, 2, 3],
      );
    });
  });

  describe('sequence', () => {
    it('builds from the row index', () => {
      deq(
        draw(
          sequence((index) => `owner-${index}@example.com`),
          3,
        ),
        ['owner-0@example.com', 'owner-1@example.com', 'owner-2@example.com'],
      );
    });

    it('draws nothing from the random source', () => {
      const context = contextFor();
      sequence((index) => index)(context);
      eq(context.random.next(), createRandomSource(SEED).next());
    });
  });

  describe('derive', () => {
    it('builds from the columns already generated for the row', () => {
      const row = { startDate: new Date('2024-01-01T00:00:00.000Z') };
      const endDate = derive((columns) => new Date(columns.startDate.getTime() + 86_400_000));
      deq(isoOf(draw(endDate, 1, { row })), ['2024-01-02T00:00:00.000Z']);
    });

    it('passes the whole context as its second argument', () => {
      const postcode = derive((_row, context) => context.random.pick(['AA1 1AA', 'BB2 2BB']));
      deq(draw(postcode, 3), ['BB2 2BB', 'AA1 1AA', 'BB2 2BB']);
    });
  });

  describe('unique', () => {
    it('emits every value of a small space exactly once', () => {
      const values = draw(unique(randomInteger(1, 3)), 3);
      deq([...values].sort(), [1, 2, 3]);
    });

    it('distinguishes values a plain set would conflate', () => {
      const from = new Date('2024-01-01T00:00:00.000Z');
      const to = new Date('2024-01-01T00:00:00.003Z');
      const values = isoOf(draw(unique(randomDateBetween(from, to)), 3));
      eq(new Set(values).size, 3);
    });

    it('throws naming the attempts and the seed once the space is exhausted', () => {
      throws(() => draw(unique(randomInteger(1, 3)), 4), {
        name: 'UniqueValueExhaustedError',
        message:
          'Could not generate a unique value in 100 attempts with seed 42. ' +
          'Widen the range of values the generator can produce, or replace unique() with sequence(), ' +
          'which is unique by construction.',
        attempts: 100,
        seed: 42,
      });
    });

    it('honours a configured attempt limit', () => {
      throws(() => draw(unique(constant('taken'), { maxAttempts: 3 }), 2), {
        name: 'UniqueValueExhaustedError',
        message: /in 3 attempts with seed 42/,
        attempts: 3,
      });
    });

    it('forgets the values of earlier runs', () => {
      const referenceNumber = unique(randomInteger(1, 3));
      deq([...draw(referenceNumber, 3)].sort(), [1, 2, 3]);
      deq([...draw(referenceNumber, 3, { seed: 7 })].sort(), [1, 2, 3]);
    });

    it('keeps separate runs from sharing a value space', () => {
      const referenceNumber = unique(randomInteger(1, 1_000_000));
      const firstRun = contextFor();
      const secondRun = contextFor();
      eq(referenceNumber(firstRun), referenceNumber(secondRun));
    });
  });

  describe('reproducibility', () => {
    const everyGenerator = () => [
      randomInteger(1, 100),
      randomDecimalString(0, 100, 2),
      randomBoolean(),
      randomWords(),
      randomUuid(),
      randomDateBetween(new Date('2000-01-01T00:00:00.000Z'), new Date('2020-12-31T00:00:00.000Z')),
      randomTimestampWithinYears(5),
      pickFrom(['north', 'south', 'east', 'west']),
      optional(randomInteger(1, 9)),
      unique(randomInteger(1, 1_000_000)),
    ];

    const drawEach = (seed) => everyGenerator().map((generator) => JSON.stringify(draw(generator, 100, { seed })));

    it('replays identical values for the same seed', () => {
      deq(drawEach(SEED), drawEach(SEED));
    });

    it('diverges for different seeds', () => {
      drawEach(SEED).forEach((values, index) => notEq(values, drawEach(43)[index]));
    });
  });
});
