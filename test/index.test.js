const { describe, it } = require('node:test');
const { deepEqual: deq } = require('node:assert');

describe('index', () => {
  it('exports the public api', () => {
    deq(Object.keys(require('../lib')).sort(), [
      'ColumnKind',
      'IdentifierCasing',
      'extractCanonicalSchema',
      'structuralDefault',
    ]);
  });
});
