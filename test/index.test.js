const { describe, it } = require('node:test');
const { deepEqual: deq } = require('node:assert');

describe('index', () => {
  it('loads the package entry point', () => {
    deq(require('../lib'), {});
  });
});
