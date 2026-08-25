const { createRandomSource } = require('../../lib/random-source');

const SEED = 42;
const REFERENCE_DATE = new Date('2024-06-01T00:00:00.000Z');

const contextFor = ({ seed = SEED, row = {}, referenceDate = REFERENCE_DATE } = {}) => ({
  random: createRandomSource(seed),
  seed,
  row,
  rowIndex: 0,
  lookups: {},
  referenceDate,
});

const draw = (generator, count, options) => {
  const context = contextFor(options);
  return Array.from({ length: count }, (_, rowIndex) => generator({ ...context, rowIndex }));
};

module.exports = { REFERENCE_DATE, SEED, contextFor, draw };
