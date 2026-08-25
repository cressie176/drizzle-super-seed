const { ColumnKind } = require('./column-kind');
const { normalInteger, weightedPick, weightedPickFrom, zipfInteger } = require('./distribution-generators');
const { IdentifierCasing, extractCanonicalSchema } = require('./drizzle-schema-adapter');
const { generate } = require('./generation-engine');
const { structuralDefault } = require('./generation-rules');
const { createInMemoryGraphSink } = require('./in-memory-graph-sink');
const { TriggerHandling } = require('./postgres-copy-script');
const { createPostgresSqlFileSink } = require('./postgres-sql-file-sink');
const { createPostgresSqlStreamSink } = require('./postgres-sql-stream-sink');
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
  IdentifierCasing,
  TriggerHandling,
  constant,
  createInMemoryGraphSink,
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
