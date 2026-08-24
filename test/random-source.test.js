const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, notDeepEqual: notDeq, ok, match } = require('node:assert');
const { createRandomSource } = require('../lib/random-source');

const draw = (seed, count, take) => {
  const random = createRandomSource(seed);
  return Array.from({ length: count }, () => take(random));
};

const nextDraws = (seed, count) => draw(seed, count, (random) => random.next());

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('random source', () => {
  describe('reproducibility', () => {
    it('replays an identical sequence for the same seed', () => {
      deq(nextDraws(42, 10_000), nextDraws(42, 10_000));
    });

    it('diverges for different seeds', () => {
      notDeq(nextDraws(42, 10_000), nextDraws(43, 10_000));
    });

    it('pins the sequence a seed produces', () => {
      deq(
        nextDraws(42, 5).map((value) => value.toFixed(12)),
        ['0.601103751920', '0.448290558998', '0.852465793490', '0.669734041439', '0.174813898746'],
      );
    });
  });

  describe('next', () => {
    it('stays within [0, 1)', () => {
      const values = nextDraws(7, 10_000);
      ok(
        values.every((value) => value >= 0 && value < 1),
        'every draw should fall within [0, 1)',
      );
    });
  });

  describe('intBetween', () => {
    it('hits both bounds and nothing outside them', () => {
      const values = draw(1, 10_000, (random) => random.intBetween(3, 9));
      deq(
        [...new Set(values)].sort((a, b) => a - b),
        [3, 4, 5, 6, 7, 8, 9],
      );
    });

    it('returns the only value in a single value range', () => {
      deq([...new Set(draw(1, 100, (random) => random.intBetween(5, 5)))], [5]);
    });
  });

  describe('chance', () => {
    it('always fires at a probability of one and never at zero', () => {
      deq([...new Set(draw(1, 100, (random) => random.chance(1)))], [true]);
      deq([...new Set(draw(1, 100, (random) => random.chance(0)))], [false]);
    });

    it('fires about as often as its probability over a large sample', () => {
      const fired = draw(1, 100_000, (random) => random.chance(0.25)).filter(Boolean).length;
      ok(fired > 24_000 && fired < 26_000, `expected about 25000 of 100000 draws to fire, but ${fired} did`);
    });
  });

  describe('pick', () => {
    it('covers every item over a large sample', () => {
      const items = ['north-east', 'south-west', 'wales'];
      deq([...new Set(draw(1, 10_000, (random) => random.pick(items)))].sort(), [...items].sort());
    });

    it('returns the only item of a single item list', () => {
      eq(createRandomSource(1).pick(['wales']), 'wales');
    });
  });

  describe('uuid', () => {
    it('is version 4 shaped', () => {
      for (const value of draw(1, 1_000, (random) => random.uuid())) match(value, UUID_V4);
    });

    it('replays identical uuids for the same seed', () => {
      deq(
        draw(42, 100, (random) => random.uuid()),
        draw(42, 100, (random) => random.uuid()),
      );
    });

    it('diverges for different seeds', () => {
      notDeq(
        draw(42, 100, (random) => random.uuid()),
        draw(43, 100, (random) => random.uuid()),
      );
    });

    it('pins the uuids a seed produces', () => {
      deq(
        draw(42, 2, (random) => random.uuid()),
        ['9972daab-2c86-459f-9d78-3fe1be4e3280', 'af9c0078-d60d-4708-840f-2fc887062cd7'],
      );
    });

    it('does not repeat within a run', () => {
      const values = draw(1, 10_000, (random) => random.uuid());
      eq(new Set(values).size, values.length);
    });
  });
});
