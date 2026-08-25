import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInMemoryGraphSink, generate } from 'drizzle-super-seed';
import { rules } from '../src/rules.ts';
import * as schema from '../src/schema.ts';

test('a cancelled letting is excluded from the invoice', async () => {
  const data = await generate(
    {
      schema,
      rules,
      counts: { parks: 1, pitches: 1, owners: 1, holidayHomes: 1, lettings: 3 },
      overrides: { lettings: [{ status: 'cancelled' }] },
      seed: 42,
    },
    createInMemoryGraphSink(),
  );

  const [cancelled, ...rest] = data.rows.lettings;

  assert.equal(cancelled.status, 'cancelled');
  assert.equal(rest.length, 2);
});

test('every generated letting belongs to a holiday home the graph can navigate to', async () => {
  const data = await generate(
    {
      schema,
      rules,
      counts: { parks: 2, pitches: 4, owners: 3, holidayHomes: 4, lettings: 8 },
      seed: 42,
    },
    createInMemoryGraphSink(),
  );

  for (const letting of data.rows.lettings) {
    const home = data.parentOf('lettings', letting, 'holidayHomeId');
    assert.ok(home, 'every letting has a holiday home');
    assert.equal(home?.id, letting.holidayHomeId);
  }

  const [park] = data.rows.parks;
  assert.ok(data.childrenOf('parks', park, 'pitches').length > 0);
});

test('independently generated fees cannot be confused with one another', async () => {
  const data = await generate(
    {
      schema,
      rules,
      counts: { parks: 1, pitches: 1, owners: 1, holidayHomes: 1, lettings: 1 },
      seed: 42,
    },
    createInMemoryGraphSink(),
  );

  assert.notEqual(data.rows.pitches[0].monthlyFee, data.rows.lettings[0].cleaningFee);
});

test('the same seed replays the same dataset', async () => {
  const counts = { parks: 1, pitches: 2, owners: 2, holidayHomes: 2, lettings: 4 };
  const first = await generate({ schema, rules, counts, seed: 7 }, createInMemoryGraphSink());
  const second = await generate({ schema, rules, counts, seed: 7 }, createInMemoryGraphSink());

  assert.deepEqual(second.rows, first.rows);
});
