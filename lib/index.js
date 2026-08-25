const { ColumnKind, Dialect } = require('./canonical-schema');
const { normalInteger, weightedPick, weightedPickFrom, zipfInteger } = require('./distribution-generators');
const { IdentifierCasing, extractCanonicalSchema } = require('./drizzle-schema-adapter');
const { generate } = require('./generation-engine');
const { structuralDefault } = require('./generation-rules');
const { createInMemoryGraphSink } = require('./in-memory-graph-sink');
const { createCsvFileSink } = require('./csv/csv-file-sink');
const { createMariaDbSqlFileSink } = require('./mariadb/mariadb-sql-file-sink');
const { TriggerHandling } = require('./postgres/postgres-copy-script');
const { createPostgresSqlFileSink } = require('./postgres/postgres-sql-file-sink');
const { createPostgresSqlStreamSink } = require('./postgres/postgres-sql-stream-sink');
const { createRowBatchSink } = require('./row-batch-sink');
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
  selfReference,
  sequence,
  unique,
} = require('./value-generators');

// Every export is named individually rather than spread from its module, because Node's CommonJS
// export detection reads this object statically; a spread hides the names and leaves an ES module
// consumer unable to import any of them.
module.exports = {
  ColumnKind,
  Dialect,
  IdentifierCasing,
  TriggerHandling,
  constant,
  createCsvFileSink,
  createInMemoryGraphSink,
  createMariaDbSqlFileSink,
  createPostgresSqlFileSink,
  createPostgresSqlStreamSink,
  createRowBatchSink,
  derive,
  extractCanonicalSchema,
  generate,
  normalInteger,
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
  structuralDefault,
  unique,
  weightedPick,
  weightedPickFrom,
  zipfInteger,
};
