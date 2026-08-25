const { describe, it } = require('node:test');
const { deepEqual: deq } = require('node:assert');

describe('index', () => {
  it('exports the public api', () => {
    deq(Object.keys(require('../lib')).sort(), [
      'ColumnKind',
      'IdentifierCasing',
      'constant',
      'derive',
      'extractCanonicalSchema',
      'normalInteger',
      'optional',
      'pickFrom',
      'randomBoolean',
      'randomDateBetween',
      'randomDecimalString',
      'randomInteger',
      'randomTimestampWithinYears',
      'randomUuid',
      'randomWords',
      'sequence',
      'structuralDefault',
      'unique',
      'weightedPick',
      'weightedPickFrom',
      'zipfInteger',
    ]);
  });
});
