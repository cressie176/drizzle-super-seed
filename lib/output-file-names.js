const { InvalidFilePrefixError } = require('./generation-errors');

// Every generated file carries a prefix so the set sorts after any digit-prefixed migration
// sharing its directory. A number alone cannot do this: comparing a five-digit prefix with a
// four-digit one reaches `_` against a digit and loses, so 10010_parks.sql sorts before
// 2000_migration.sql. A leading letter beats every digit in both C and en_US collations, which
// is what the postgres and mariadb entrypoints use.
const DEFAULT_FILE_PREFIX = 'seed-';

const NUMBER_STEP = 10;
const NUMBER_WIDTH = 5;
const FIRST_NUMBER = 10;
const LAST_NUMBER = 99990;

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
