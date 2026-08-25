const { describe, it } = require('node:test');
const { deepEqual: deq, notEqual: notEq, ok } = require('node:assert');
const { SEED, draw } = require('./lib/generator-draws');
const { normalInteger, weightedPick, weightedPickFrom, zipfInteger } = require('../lib');

const LARGE_SAMPLE = 10_000;
const HUGE_SAMPLE = 100_000;
const RATE_TOLERANCE = 0.02;
const MEAN_TOLERANCE = 1;

const rateOf = (values, matches) => values.filter(matches).length / values.length;

const closeTo = (actual, expected, tolerance) => Math.abs(actual - expected) <= tolerance;

const countOf = (values, wanted) => values.filter((value) => value === wanted).length;

const meanOf = (values) => values.reduce((total, value) => total + value, 0) / values.length;

const standardDeviationOf = (values) => {
  const mean = meanOf(values);
  return Math.sqrt(meanOf(values.map((value) => (value - mean) ** 2)));
};

describe('distribution generators', () => {
  describe('weightedPick', () => {
    it('pins the picks a seed produces', () => {
      deq(draw(weightedPick({ a: 3, b: 1 }), 12), ['a', 'a', 'b', 'a', 'a', 'a', 'a', 'a', 'b', 'a', 'a', 'b']);
    });

    it('honours the ratio between the weights', () => {
      const values = draw(weightedPick({ a: 3, b: 1 }), LARGE_SAMPLE);
      ok(
        closeTo(
          rateOf(values, (value) => value === 'a'),
          0.75,
          RATE_TOLERANCE,
        ),
        'three values in four should be a',
      );
    });

    it('does not require the weights to sum to one', () => {
      deq(draw(weightedPick({ a: 0.75, b: 0.25 }), LARGE_SAMPLE), draw(weightedPick({ a: 3, b: 1 }), LARGE_SAMPLE));
    });

    it('never emits a zero weight entry', () => {
      const values = draw(weightedPick({ a: 1, b: 0, c: 1 }), LARGE_SAMPLE);
      deq([...new Set(values)].sort(), ['a', 'c']);
    });

    it('emits the only entry of a single entry map', () => {
      deq([...new Set(draw(weightedPick({ only: 7 }), 100))], ['only']);
    });
  });

  describe('weightedPickFrom', () => {
    const occupancy = [
      { value: 0, weight: 1 },
      { value: 1, weight: 9 },
    ];

    it('pins the picks a seed produces', () => {
      deq(draw(weightedPickFrom(occupancy), 12), [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    });

    it('honours the ratio between the weights', () => {
      const values = draw(weightedPickFrom(occupancy), LARGE_SAMPLE);
      ok(
        closeTo(
          rateOf(values, (value) => value === 1),
          0.9,
          RATE_TOLERANCE,
        ),
        'nine values in ten should be one',
      );
    });

    it('emits values a weights map could not key, by identity', () => {
      const south = { region: 'south-west' };
      const wales = { region: 'wales' };
      const values = draw(
        weightedPickFrom([
          { value: south, weight: 1 },
          { value: wales, weight: 1 },
        ]),
        LARGE_SAMPLE,
      );
      deq(new Set(values), new Set([south, wales]));
    });

    it('never emits a zero weight entry', () => {
      const values = draw(
        weightedPickFrom([
          { value: 'kept', weight: 1 },
          { value: 'never', weight: 0 },
          { value: 'also kept', weight: 1 },
        ]),
        LARGE_SAMPLE,
      );
      deq([...new Set(values)].sort(), ['also kept', 'kept']);
    });
  });

  describe('zipfInteger', () => {
    it('pins the integers a seed produces', () => {
      deq(draw(zipfInteger(1, 100), 12), [13, 6, 47, 18, 1, 9, 2, 14, 50, 7, 2, 55]);
    });

    it('falls away with rank', () => {
      const values = draw(zipfInteger(1, 100), HUGE_SAMPLE);
      ok(countOf(values, 1) > countOf(values, 10), 'rank one should beat rank ten');
      ok(countOf(values, 10) > countOf(values, 100), 'rank ten should beat rank one hundred');
    });

    it('stays within the bounds over a large sample', () => {
      const values = draw(zipfInteger(1, 100), HUGE_SAMPLE);
      ok(
        values.every((value) => Number.isInteger(value) && value >= 1 && value <= 100),
        'every value should be an integer within [1, 100]',
      );
    });

    it('ranks from the lower bound rather than from one', () => {
      const values = draw(zipfInteger(20, 24), LARGE_SAMPLE);
      deq(
        [...new Set(values)].sort((a, b) => a - b),
        [20, 21, 22, 23, 24],
      );
      ok(countOf(values, 20) > countOf(values, 24), 'the lower bound should be the commonest value');
    });

    it('gives rank one the share the harmonic weights predict', () => {
      const values = draw(zipfInteger(1, 100), HUGE_SAMPLE);
      const harmonic = Array.from({ length: 100 }, (_, index) => 1 / (index + 1)).reduce((total, w) => total + w, 0);
      ok(
        closeTo(countOf(values, 1) / HUGE_SAMPLE, 1 / harmonic, RATE_TOLERANCE),
        'rank one should take one part in the hundredth harmonic number',
      );
    });

    it('concentrates further as the skew rises', () => {
      const gentle = draw(zipfInteger(1, 100, 1), LARGE_SAMPLE);
      const steep = draw(zipfInteger(1, 100, 2), LARGE_SAMPLE);
      ok(countOf(steep, 1) > countOf(gentle, 1), 'a steeper skew should favour rank one more strongly');
    });

    it('emits the only value a single rank allows', () => {
      deq([...new Set(draw(zipfInteger(7, 7), 100))], [7]);
    });
  });

  describe('normalInteger', () => {
    it('pins the integers a seed produces', () => {
      deq(draw(normalInteger(50, 10, { min: 0, max: 100 }), 12), [37, 41, 44, 44, 30, 56, 44, 43, 38, 49, 68, 63]);
    });

    it('centres on the mean', () => {
      const values = draw(normalInteger(50, 10, { min: 0, max: 100 }), HUGE_SAMPLE);
      ok(closeTo(meanOf(values), 50, MEAN_TOLERANCE), 'the sample mean should be within one of fifty');
    });

    it('spreads by the standard deviation', () => {
      const values = draw(normalInteger(50, 10, { min: 0, max: 100 }), HUGE_SAMPLE);
      ok(closeTo(standardDeviationOf(values), 10, MEAN_TOLERANCE), 'the sample spread should be within one of ten');
    });

    it('emits no value outside the clamp', () => {
      const values = draw(normalInteger(50, 10, { min: 0, max: 100 }), HUGE_SAMPLE);
      ok(
        values.every((value) => Number.isInteger(value) && value >= 0 && value <= 100),
        'every value should be an integer within [0, 100]',
      );
    });

    it('folds the tails onto a clamp that bites', () => {
      const values = draw(normalInteger(50, 10, { min: 45, max: 55 }), LARGE_SAMPLE);
      ok(
        values.every((value) => value >= 45 && value <= 55),
        'every value should fall within the clamp',
      );
      ok(countOf(values, 45) > countOf(values, 46), 'the lower bound should absorb the tail beneath it');
      ok(countOf(values, 55) > countOf(values, 54), 'the upper bound should absorb the tail above it');
    });

    it('leaves the tails alone when no clamp is given', () => {
      const values = draw(normalInteger(0, 10), HUGE_SAMPLE);
      ok(
        values.some((value) => value < -30) && values.some((value) => value > 30),
        'an unclamped sample should reach three standard deviations either way',
      );
    });
  });

  describe('reproducibility', () => {
    const everyGenerator = () => [
      weightedPick({ a: 3, b: 1 }),
      weightedPickFrom([
        { value: 0, weight: 1 },
        { value: 1, weight: 9 },
      ]),
      zipfInteger(1, 100),
      normalInteger(50, 10, { min: 0, max: 100 }),
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
