const { describe, it } = require('node:test');
const { deepEqual: deq } = require('node:assert');

describe('index', () => {
  it('exports the public api', () => {
    deq(Object.keys(require('../lib')).sort(), [
      'ColumnKind',
      'Dialect',
      'IdentifierCasing',
      'TableLogging',
      'TriggerHandling',
      'constant',
      'createCsvFileSink',
      'createInMemoryGraphSink',
      'createMariaDbSqlFileSink',
      'createPostgresSqlFileSink',
      'createPostgresSqlStreamSink',
      'createRowBatchSink',
      'derive',
      'extractCanonicalSchema',
      'generate',
      'normalInteger',
      'optional',
      'pickFrom',
      'randomBoolean',
      'randomDateBetween',
      'randomDecimalString',
      'randomInteger',
      'randomTimestampWithinYears',
      'randomUuid',
      'randomVector',
      'randomWords',
      'selfReference',
      'sequence',
      'structuralDefault',
      'unique',
      'unseeded',
      'weightedPick',
      'weightedPickFrom',
      'zipfInteger',
    ]);
  });
});
