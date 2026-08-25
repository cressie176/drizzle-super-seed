const { describe, it } = require('node:test');
const { rejects, throws } = require('node:assert');
const { createInMemoryGraphSink, extractCanonicalSchema, generate } = require('../lib');

const EXPECTED = {
  name: 'EmptySchemaError',
  message:
    'The schema module contains no drizzle tables. Either the import points at the wrong module, ' +
    'or node_modules holds more than one copy of drizzle-orm, in which case no table is recognised ' +
    'as one: check with npm ls drizzle-orm and deduplicate.',
};

describe('an empty schema module', () => {
  it('is refused at extraction, naming the likely causes', () => {
    throws(() => extractCanonicalSchema({}), EXPECTED);
  });

  it('is refused before generation rather than silently producing nothing', async () => {
    await rejects(generate({ schema: {}, rules: {}, counts: {}, seed: 1 }, createInMemoryGraphSink()), EXPECTED);
  });

  it('is refused when the module exports things, none of which are tables', () => {
    throws(() => extractCanonicalSchema({ helper: () => 1, constant: 42 }), EXPECTED);
  });
});
