const { InvalidFilePrefixError } = require('./generation-errors');

// Every generated file carries a prefix so the set sorts after any digit-prefixed migration
// sharing its directory. A number alone cannot do this: comparing a five-digit prefix with a
// four-digit one reaches `_` against a digit and loses, so 10010_parks.sql sorts before
// 2000_migration.sql. A leading letter beats every digit in both C and en_US collations, which
// is what the postgres and mariadb entrypoints use.
const DEFAULT_FILE_PREFIX = 'seed-';

// Four digits in steps of ten. Unlike migrations, which accumulate for the life of a project,
// a run's files are replaced wholesale each time, so the sequence only has to hold one schema's
// tables and its deferred files rather than a history: 998 slots, not a growing count.
const NUMBER_STEP = 10;
const NUMBER_WIDTH = 4;
const FIRST_NUMBER = 10;
const LAST_NUMBER = 9990;

const PATH_SEPARATORS = /[/\\]/;

const requireWritablePrefix = (prefix) => {
  if (!PATH_SEPARATORS.test(prefix)) return prefix;
  throw new InvalidFilePrefixError({ prefix });
};

const fileNumber = (index) => String(FIRST_NUMBER + index * NUMBER_STEP).padStart(NUMBER_WIDTH, '0');

const numberedName = (prefix, index) => `${prefix}${fileNumber(index)}`;

const reservedName = (prefix, number) => `${prefix}${String(number).padStart(NUMBER_WIDTH, '0')}`;

module.exports = {
  DEFAULT_FILE_PREFIX,
  FIRST_NUMBER,
  LAST_NUMBER,
  NUMBER_STEP,
  fileNumber,
  numberedName,
  requireWritablePrefix,
  reservedName,
};
