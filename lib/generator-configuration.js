const { InvalidGeneratorConfigurationError } = require('./generation-errors');

const refuse = (factory, reason, detail = {}) => {
  throw new InvalidGeneratorConfigurationError({ factory, reason, ...detail });
};

const requireEntries = (factory, entries) => {
  if (entries.length > 0) return;
  refuse(factory, 'noEntries');
};

const totalOf = (weights) => weights.reduce((total, weight) => total + weight, 0);

const requireDrawableWeights = (factory, weights) => {
  for (const weight of weights) {
    if (!Number.isFinite(weight)) refuse(factory, 'unusableWeight', { value: weight });
    if (weight < 0) refuse(factory, 'negativeWeight', { value: weight });
  }
  if (totalOf(weights) > 0) return;
  refuse(factory, 'zeroWeights');
};

const requireOrderedRange = (factory, min, max) => {
  if (min <= max) return;
  refuse(factory, 'unorderedRange', { min, max });
};

const requireFiniteRange = (factory, min, max) => {
  for (const bound of [min, max]) {
    if (!Number.isFinite(bound)) refuse(factory, 'unusableBound', { value: bound });
  }
  requireOrderedRange(factory, min, max);
};

const requireWholeRange = (factory, min, max) => {
  for (const bound of [min, max]) {
    if (!Number.isInteger(bound)) refuse(factory, 'fractionalBound', { value: bound });
  }
  requireOrderedRange(factory, min, max);
};

const requireSkew = (factory, skew) => {
  if (Number.isFinite(skew) && skew >= 0) return;
  refuse(factory, 'unusableSkew', { value: skew });
};

const requireMean = (factory, mean) => {
  if (Number.isFinite(mean)) return;
  refuse(factory, 'unusableMean', { value: mean });
};

const requireDeviation = (factory, stdDev) => {
  if (Number.isFinite(stdDev) && stdDev >= 0) return;
  refuse(factory, 'unusableDeviation', { value: stdDev });
};

const requireOrderedClamp = (factory, { min, max }) => {
  if (min <= max) return;
  refuse(factory, 'unorderedClamp', { min, max });
};

const requireScale = (factory, scale) => {
  if (Number.isInteger(scale) && scale >= 0) return;
  refuse(factory, 'unusableScale', { value: scale });
};

const requireProbability = (factory, probability) => {
  if (Number.isFinite(probability) && probability >= 0 && probability <= 1) return;
  refuse(factory, 'unusableProbability', { value: probability });
};

const requireWordLengths = (factory, minLength, maxLength) => {
  for (const length of [minLength, maxLength]) {
    if (!Number.isInteger(length) || length < 1) refuse(factory, 'unusableLength', { value: length });
  }
  requireOrderedRange(factory, minLength, maxLength);
};

const requireInstants = (factory, from, to) => {
  if (from.getTime() <= to.getTime()) return;
  refuse(factory, 'unorderedRange', { min: from.toISOString(), max: to.toISOString() });
};

const requireAttempts = (factory, maxAttempts) => {
  if (Number.isInteger(maxAttempts) && maxAttempts >= 1) return;
  refuse(factory, 'unusableAttempts', { value: maxAttempts });
};

module.exports = {
  requireAttempts,
  requireDeviation,
  requireDrawableWeights,
  requireEntries,
  requireFiniteRange,
  requireInstants,
  requireMean,
  requireOrderedClamp,
  requireProbability,
  requireScale,
  requireSkew,
  requireWholeRange,
  requireWordLengths,
};
