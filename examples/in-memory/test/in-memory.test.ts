// The in-memory example: a complete, navigable dataset for unit tests, no database involved.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInMemoryGraphSink, generate } from 'drizzle-super-seed';
import { SEED, seedFaker } from '../src/generators.ts';

const testCounts = { parks: 1, pitches: 2, owners: 2, holidayHomes: 1, lettings: 3 };
import { rules } from '../src/rules.ts';
import * as schema from '../src/schema.ts';

// Faker's stream continues across runs in one process, so each run re-seeds both sides.
const generateGraph = (seed = SEED, overrides = {}) => {
  seedFaker(seed);
  return generate({ schema, rules, counts: testCounts, seed, ...overrides }, createInMemoryGraphSink<typeof schema>());
};

test('a cancelled letting is excluded from the invoice', async () => {
  const data = await generateGraph(SEED, { overrides: { lettings: [{ status: 'cancelled' }] } });
  const [cancelled, ...rest] = data.rows.lettings;

  assert.equal(cancelled.status, 'cancelled');
  assert.equal(rest.length, 2);
});

test('every letting navigates to its holiday home, and every park to its pitches', async () => {
  const data = await generateGraph();

  for (const letting of data.rows.lettings) {
    const home = data.parentOf<'holidayHomes'>('lettings', letting, 'holidayHomeId');
    assert.equal(home?.id, letting.holidayHomeId);
  }
  const [park] = data.rows.parks;
  assert.ok(data.childrenOf('parks', park, 'pitches').length > 0);
});

test('names and emails are realistic, not word soup', async () => {
  const data = await generateGraph();
  const [owner] = data.rows.owners;

  // Passing the schema type to the sink makes these rows their real types: no String() casts.
  assert.match(owner.fullName, /^[A-Z][\S]*.* /, 'a faker name starts with a capital and has parts');
  assert.match(owner.email, /@example\.com$/);
  assert.ok(owner.email.startsWith(owner.fullName.toLowerCase().replace(/[^a-z]+/g, '.')));
});

test('independently generated fees cannot be confused with one another', async () => {
  const data = await generateGraph();

  assert.notEqual(data.rows.pitches[0].monthlyFee, data.rows.lettings[0].cleaningFee);
});

test('the same seed replays the same dataset', async () => {
  const first = await generateGraph(7);
  const second = await generateGraph(7);

  assert.deepEqual(second.rows, first.rows);
});
