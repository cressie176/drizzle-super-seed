const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, throws } = require('node:assert');
const {
  normalInteger,
  optional,
  randomBoolean,
  randomDateBetween,
  randomDecimalString,
  randomInteger,
  randomWords,
  unique,
  weightedPick,
  weightedPickFrom,
  zipfInteger,
} = require('../lib');

// The table #22 recorded, plus the value-generator bounds, encoded before the validation exists.
// Every row emitted a plausible constant, or drew from a broken distribution, and no sink could
// have told the difference.
const REFUSALS = [
  {
    call: () => weightedPick({}),
    factory: 'weightedPick',
    reason: 'noEntries',
    message: 'weightedPick was given no entries, so there is nothing to draw. Give it at least one entry.',
  },
  {
    call: () => weightedPickFrom([]),
    factory: 'weightedPickFrom',
    reason: 'noEntries',
    message: 'weightedPickFrom was given no entries, so there is nothing to draw. Give it at least one entry.',
  },
  {
    call: () => weightedPick({ a: 0, b: 0 }),
    factory: 'weightedPick',
    reason: 'zeroWeights',
    message:
      'weightedPick was given weights which are all zero, so no entry can ever be drawn. ' +
      'Give at least one entry a positive weight.',
  },
  {
    call: () => weightedPick({ a: 1, b: -1, c: 1 }),
    factory: 'weightedPick',
    reason: 'negativeWeight',
    message:
      'weightedPick was given the weight -1, which breaks the running totals it draws from and makes ' +
      'the distribution a constant. Every weight must be zero or more.',
  },
  {
    call: () => weightedPickFrom([{ value: 'a', weight: Number.NaN }]),
    factory: 'weightedPickFrom',
    reason: 'unusableWeight',
    message: 'weightedPickFrom was given the weight NaN, which is not a finite number. Every weight must be one.',
  },
  {
    call: () => zipfInteger(10, 1),
    factory: 'zipfInteger',
    reason: 'unorderedRange',
    message: 'zipfInteger was given the range 10 to 1, which is empty. The lower bound must not exceed the upper.',
  },
  {
    call: () => zipfInteger(1.5, 10),
    factory: 'zipfInteger',
    reason: 'fractionalBound',
    message: 'zipfInteger was given the bound 1.5, which is not a whole number. Both bounds must be integers.',
  },
  {
    call: () => zipfInteger(1, 10, -1),
    factory: 'zipfInteger',
    reason: 'unusableSkew',
    message: 'zipfInteger was given the skew -1, which cannot weight its ranks. The skew must be zero or more.',
  },
  {
    call: () => normalInteger(Number.NaN, 10),
    factory: 'normalInteger',
    reason: 'unusableMean',
    message: 'normalInteger was given the mean NaN, which is not a finite number. The mean must be one.',
  },
  {
    call: () => normalInteger(50, -1),
    factory: 'normalInteger',
    reason: 'unusableDeviation',
    message:
      'normalInteger was given the standard deviation -1, which describes no spread. ' +
      'The standard deviation must be zero or more.',
  },
  {
    call: () => normalInteger(50, 10, { min: 100, max: 0 }),
    factory: 'normalInteger',
    reason: 'unorderedClamp',
    message:
      'normalInteger was given a clamp of 100 to 0, so every value would be forced to the same number. ' +
      'The clamp minimum must not exceed its maximum.',
  },
  {
    call: () => randomInteger(5, 1),
    factory: 'randomInteger',
    reason: 'unorderedRange',
    message: 'randomInteger was given the range 5 to 1, which is empty. The lower bound must not exceed the upper.',
  },
  {
    call: () => randomInteger(0, Number.POSITIVE_INFINITY),
    factory: 'randomInteger',
    reason: 'unusableBound',
    message: 'randomInteger was given the bound Infinity, which is not a finite number. Both bounds must be finite.',
  },
  {
    call: () => randomDecimalString(90, 30, 2),
    factory: 'randomDecimalString',
    reason: 'unorderedRange',
    message:
      'randomDecimalString was given the range 90 to 30, which is empty. The lower bound must not exceed the upper.',
  },
  {
    call: () => randomDecimalString(0, 10, -1),
    factory: 'randomDecimalString',
    reason: 'unusableScale',
    message:
      'randomDecimalString was given the scale -1, which is not a whole number of zero or more. ' +
      'The scale is how many decimal places to emit.',
  },
  {
    call: () => randomBoolean(1.5),
    factory: 'randomBoolean',
    reason: 'unusableProbability',
    message: 'randomBoolean was given the probability 1.5, which is outside 0 to 1.',
  },
  {
    call: () => optional(randomInteger(1, 10), -0.5),
    factory: 'optional',
    reason: 'unusableProbability',
    message: 'optional was given the probability -0.5, which is outside 0 to 1.',
  },
  {
    call: () => randomWords({ minLength: 12, maxLength: 4 }),
    factory: 'randomWords',
    reason: 'unorderedRange',
    message: 'randomWords was given the range 12 to 4, which is empty. The lower bound must not exceed the upper.',
  },
  {
    call: () => randomWords({ minLength: 0, maxLength: 4 }),
    factory: 'randomWords',
    reason: 'unusableLength',
    message: 'randomWords was given the length 0, which cannot make a word. Lengths must be one or more.',
  },
  {
    call: () => randomDateBetween(new Date('2026-01-02'), new Date('2026-01-01')),
    factory: 'randomDateBetween',
    reason: 'unorderedRange',
    message:
      'randomDateBetween was given the range 2026-01-02T00:00:00.000Z to 2026-01-01T00:00:00.000Z, which is empty. ' +
      'The lower bound must not exceed the upper.',
  },
  {
    call: () => unique(randomInteger(1, 10), { maxAttempts: 0 }),
    factory: 'unique',
    reason: 'unusableAttempts',
    message: 'unique was given 0 attempts, so it could never draw a value. The attempt limit must be one or more.',
  },
];

describe('generator configuration which cannot describe a distribution', () => {
  for (const refusal of REFUSALS) {
    it(`refuses ${refusal.factory}: ${refusal.reason}`, () => {
      throws(refusal.call, {
        name: 'InvalidGeneratorConfigurationError',
        factory: refusal.factory,
        reason: refusal.reason,
        message: refusal.message,
      });
    });
  }

  it('refuses at the factory call, before any generation context exists', () => {
    // Nothing here supplies a random source: the mistake is in the rules file, and the stack
    // points at it rather than at a row somewhere in a run.
    throws(() => weightedPick({ a: 0 }), { name: 'InvalidGeneratorConfigurationError' });
  });

  it('carries no seed, because there is no run to reproduce', () => {
    throws(
      () => weightedPick({ a: 0 }),
      (error) => !('seed' in error),
    );
  });
});

describe('configuration which can describe a distribution', () => {
  const draw = (generator, values = 4) => {
    const random = createSequence();
    return Array.from({ length: values }, (_, rowIndex) => generator({ random, rowIndex }));
  };

  // A fixed stream, so an accidental extra draw inside a validation would change these values.
  const createSequence = () => {
    const numbers = [0.05, 0.35, 0.65, 0.95, 0.15, 0.45, 0.75, 0.85];
    let index = 0;
    const next = () => numbers[index++ % numbers.length];
    return {
      next,
      intBetween: (min, max) => min + Math.floor(next() * (max - min + 1)),
      chance: (probability) => next() < probability,
      pick: (items) => items[Math.floor(next() * items.length)],
    };
  };

  it('accepts a weighted pick and draws the same values as before', () => {
    deq(draw(weightedPick({ a: 0.75, b: 0.25 })), ['a', 'a', 'a', 'b']);
  });

  it('accepts equal bounds, which describe exactly one value', () => {
    deq(draw(zipfInteger(3, 3)), [3, 3, 3, 3]);
    deq(draw(randomInteger(3, 3)), [3, 3, 3, 3]);
  });

  it('accepts a zero standard deviation and a zero probability', () => {
    deq(draw(normalInteger(50, 0)), [50, 50, 50, 50]);
    eq(
      draw(randomBoolean(0)).every((value) => value === false),
      true,
    );
  });

  it('accepts a single entry, and a clamp whose bounds are equal', () => {
    deq(draw(weightedPickFrom([{ value: 'only', weight: 1 }])), ['only', 'only', 'only', 'only']);
    deq(draw(normalInteger(50, 10, { min: 7, max: 7 })), [7, 7, 7, 7]);
  });
});
