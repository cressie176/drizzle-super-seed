const { describe, it } = require('node:test');
const { equal: eq, notEqual: notEq } = require('node:assert');
const { structuralDefault } = require('../lib');

describe('generation rules', () => {
  describe('structuralDefault', () => {
    it('is a symbol describing itself', () => {
      eq(typeof structuralDefault, 'symbol');
      eq(structuralDefault.description, 'structuralDefault');
    });

    it('is distinct from any symbol a user could write', () => {
      notEq(structuralDefault, Symbol('structuralDefault'));
      notEq(structuralDefault, Symbol.for('structuralDefault'));
    });

    it('is the same symbol on every require', () => {
      eq(require('../lib').structuralDefault, structuralDefault);
    });
  });
});
