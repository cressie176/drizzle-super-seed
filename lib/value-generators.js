const { UniqueValueExhaustedError } = require('./generation-errors');
const {
  requireAttempts,
  requireFiniteRange,
  requireInstants,
  requireProbability,
  requireScale,
  requireWordLengths,
} = require('./generator-configuration');

const DEFAULT_NULL_PROBABILITY = 0.1;
const DEFAULT_PROBABILITY_TRUE = 0.5;
const DEFAULT_MAX_ATTEMPTS = 100;

const constant = (value) => () => value;

const randomInteger = (min, max) => {
  requireFiniteRange('randomInteger', min, max);
  return (context) => context.random.intBetween(min, max);
};

const randomDecimalString = (min, max, scale) => {
  requireFiniteRange('randomDecimalString', min, max);
  requireScale('randomDecimalString', scale);
  return (context) => (min + context.random.next() * (max - min)).toFixed(scale);
};

const randomBoolean = (probabilityTrue = DEFAULT_PROBABILITY_TRUE) => {
  requireProbability('randomBoolean', probabilityTrue);
  return (context) => context.random.chance(probabilityTrue);
};

const randomUuid = () => (context) => context.random.uuid();

const CONSONANTS = [...'bcdfghjklmnprstvwyz'];
const VOWELS = [...'aeiou'];
const ALTERNATING_LETTERS = [CONSONANTS, VOWELS];
const WORD_SEPARATOR = ' ';
const MIN_WORD_LENGTH = 3;
const MAX_WORD_LENGTH = 9;
const DEFAULT_MIN_WORDS_LENGTH = 8;
const DEFAULT_MAX_WORDS_LENGTH = 32;

const wordOfLength = (random, length) =>
  Array.from({ length }, (_, position) => random.pick(ALTERNATING_LETTERS[position % 2])).join('');

const wordLengthWithin = (random, remaining) => {
  const longest = Math.min(MAX_WORD_LENGTH, remaining);
  const length = random.intBetween(Math.min(MIN_WORD_LENGTH, longest), longest);
  const leftover = remaining - length - WORD_SEPARATOR.length;
  return leftover >= MIN_WORD_LENGTH ? length : remaining;
};

const wordsOfLength = (random, totalLength) => {
  let words = '';
  while (words.length < totalLength) {
    const separator = words.length > 0 ? WORD_SEPARATOR : '';
    const remaining = totalLength - words.length - separator.length;
    words += separator + wordOfLength(random, wordLengthWithin(random, remaining));
  }
  return words;
};

const randomWords = ({ minLength = DEFAULT_MIN_WORDS_LENGTH, maxLength = DEFAULT_MAX_WORDS_LENGTH } = {}) => {
  requireWordLengths('randomWords', minLength, maxLength);
  return (context) => wordsOfLength(context.random, context.random.intBetween(minLength, maxLength));
};

const dateBetween = (random, from, to) => new Date(from.getTime() + Math.floor(random.next() * (to - from)));

const yearsBefore = (date, years) => {
  const earlier = new Date(date.getTime());
  earlier.setUTCFullYear(earlier.getUTCFullYear() - years);
  return earlier;
};

const randomDateBetween = (from, to) => {
  requireInstants('randomDateBetween', from, to);
  return (context) => dateBetween(context.random, from, to);
};

const randomTimestampWithinYears = (years) => (context) =>
  dateBetween(context.random, yearsBefore(context.referenceDate, years), context.referenceDate);

const pickFrom = (items) => (context) => context.random.pick(items);

const optional = (generator, nullProbability = DEFAULT_NULL_PROBABILITY) => {
  requireProbability('optional', nullProbability);
  return (context) => (context.random.chance(nullProbability) ? null : generator(context));
};

const sequence = (build) => (context) => build(context.rowIndex);

const derive = (build) => (context) => build(context.row, context);

const selfReference =
  ({ nullProbability = DEFAULT_NULL_PROBABILITY } = {}) =>
  (context) => {
    const priorValues = context.priorSelfReferenceValues ?? [];
    if (priorValues.length === 0) return null;
    if (context.random.chance(nullProbability)) return null;
    return context.random.pick(priorValues);
  };

const uniquenessKey = (value) => JSON.stringify(value ?? null);

const valuesEmittedDuring = (runs, random) => {
  const emitted = runs.get(random) ?? new Set();
  runs.set(random, emitted);
  return emitted;
};

const unique = (generator, { maxAttempts = DEFAULT_MAX_ATTEMPTS } = {}) => {
  requireAttempts('unique', maxAttempts);
  const runs = new WeakMap();
  return (context) => {
    const emitted = valuesEmittedDuring(runs, context.random);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const value = generator(context);
      const key = uniquenessKey(value);
      if (emitted.has(key)) continue;
      emitted.add(key);
      return value;
    }
    throw new UniqueValueExhaustedError({ attempts: maxAttempts, seed: context.seed });
  };
};

module.exports = {
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
  selfReference,
  sequence,
  unique,
};
