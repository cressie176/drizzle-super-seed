# drizzle-super-seed

<!-- Uncomment when published
[![NPM Version](https://img.shields.io/npm/v/drizzle-super-seed)](https://www.npmjs.com/package/drizzle-super-seed)
[![CI](https://github.com/cressie176/drizzle-super-seed/actions/workflows/qa.yml/badge.svg)](https://github.com/cressie176/drizzle-super-seed/actions/workflows/qa.yml)
[![Coverage](https://codecov.io/gh/cressie176/drizzle-super-seed/branch/main/graph/badge.svg)](https://codecov.io/gh/cressie176/drizzle-super-seed)
[![Node.js](https://img.shields.io/node/v/drizzle-super-seed)](https://nodejs.org)
[![License](https://img.shields.io/npm/l/drizzle-super-seed)](LICENSE)
-->

Reproducible random test data for [Drizzle ORM](https://orm.drizzle.team/) schemas.

drizzle-super-seed separates data generation from its output. The same rules can create an in-memory dataset for a unit test, pass batches to your own insert handler for an integration test, or produce bulk SQL files containing millions of rows. These outputs are included, and you can add your own by implementing the public sink interface.

## Contents

- [The problem](#the-problem)
- [How it works](#how-it-works)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Reproducibility](#reproducibility)
- [Rules](#rules)
  - [Schema completeness](#schema-completeness)
  - [Generators](#generators)
  - [Async lookups](#async-lookups)
  - [Realistic names with faker](#realistic-names-with-faker)
- [Overrides](#overrides)
- [Counts and shape](#counts-and-shape)
  - [Pinning the shape](#pinning-the-shape)
- [Sinks](#sinks)
  - [In-memory graph](#createinmemorygraphsink-unit-tests)
  - [Row batches](#createrowbatchsink-integration-tests)
  - [PostgreSQL files](#createpostgressqlfilesink-bulk-load)
  - [PostgreSQL stream](#createpostgressqlstreamsink-streaming-bulk-load)
  - [MariaDB files](#createmariadbsqlfilesink-bulk-load)
  - [Custom sinks](#custom-sinks)
- [Schema support](#schema-support)
  - [Databases](#databases)
  - [Database names](#database-names)
  - [Identity and serial columns](#identity-and-serial-columns)
  - [Self-references and cycles](#self-references-and-cycles)
  - [Limits](#limits)
  - [Errors](#errors)
  - [Why there is no SQLite file sink](#why-there-is-no-sqlite-file-sink)
- [Comparison with drizzle-seed](#comparison-with-drizzle-seed)
- [Use with drizzle-explain](#use-with-drizzle-explain)
- [Worked example](#worked-example)
- [License](#license)

## The problem

Some defects only appear at scale, including poor query plans, pagination errors and N+1 queries. Finding them before production requires test data with realistic volume and distribution.

Loading millions of rows through ORM inserts is slow. PostgreSQL's `COPY` is much faster, but Drizzle does not provide tooling to generate `COPY` files. Writing a generator by hand creates an ongoing maintenance burden: every table and column needs generation rules, foreign key ordering and serialisation, all of which must be kept in step with the schema.

Small, hand-written fixtures create a different problem. They often repeat values:

```ts
const park = { id: 1, name: 'Greenacres', region: 'south-west' };
const pitch = { id: 1, parkId: 1, monthlyFee: '100.00' };
const letting = { id: 1, pitchId: 1, cleaningFee: '100.00' };

assert.equal(invoice.total, '200.00');
```

The assertion still passes if the code confuses `monthlyFee` with `cleaningFee`, because both happen to contain the same value. Independently generated values expose this type of error. However, random data must be reproducible so that failures can be replayed, and controllable so that a test can fix the values relevant to its assertions.

Hand-written fixtures also include values which have no bearing on the test. Generating those values leaves the test to specify only what matters, making its purpose clearer.

Finally, generation rules maintained separately from the schema can drift. A table or column is added, no corresponding rule is created, and generation continues without warning.

## How it works

Every generation run has four parts:

1. Your existing Drizzle schema describes the structure and relationships.
2. Rules describe how to generate each column.
3. Counts describe how many rows to generate and, where needed, their parent-child shape.
4. A sink decides where the generated rows go.

The generator reads the schema, creates rows from a seeded random source, and passes them to the sink. The built-in sinks can keep the data in memory, pass it to an insert handler, or write bulk SQL files. The ORM is not involved in generation.

Rules and counts are independent of the sink, so the same model can be used at different scales:

```ts
const data = await generate({ schema, rules, counts: { parks: 2, pitches: 6 } }, createInMemoryGraphSink());
await generate({ schema, rules, counts }, createRowBatchSink(insertBatch));
await generate({ schema, rules, counts: productionCounts, seed: 42 }, createPostgresSqlFileSink({ directory: 'docker/initdb' }));
```

## Installation

```sh
npm install --save-dev drizzle-super-seed
```

`drizzle-orm` is a peer dependency. drizzle-super-seed reads the schema objects you already have and has no production dependencies on faker or a database client.

Requirements:

- Node.js 22 or later
- Drizzle ORM 0.36 or later
- TypeScript 5.0 or later, if you want drift detection. Any `moduleResolution` works, from
  `NodeNext` on an ESM project to `Bundler`, and it works from CommonJS too
- PostgreSQL, MariaDB or SQLite when using a sink which connects to a database

## Quick start

The shortest way to use drizzle-super-seed is to generate a small dataset in memory. Supply the schema, its generation rules, the required row counts and any values the test needs to control:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generate, createInMemoryGraphSink } from 'drizzle-super-seed';
import { rules } from './park-rules.ts';
import * as schema from './schema.ts';

test('cancelled lettings are excluded from the invoice', async () => {
  const data = await generate({
    schema,
    rules,
    counts: { parks: 1, pitches: 2, owners: 1, holidayHomes: 1, lettings: 3 },
    overrides: {
      lettings: [
        { status: LettingStatus.Cancelled },
        { status: LettingStatus.Confirmed },
        { status: LettingStatus.Confirmed },
      ],
    },
  }, createInMemoryGraphSink());

  const invoice = buildInvoice(data.rows.lettings);
  assert.equal(invoice.lines.length, 2);   // the two confirmed lettings; the cancelled one is excluded
});
```

This creates one park, two pitches, one owner, one holiday home and three lettings across the whole dataset. Foreign keys are assigned from the generated parent rows. Because there is only one holiday home, all three lettings belong to it.

The test controls the three statuses because those values are relevant to the assertion. Dates, fees, names and other incidental values remain random. This makes the important test data visible without maintaining a complete fixture.

Counts can also be defined per parent when the shape of the dataset matters. Both forms are explained in [Counts and shape](#counts-and-shape).

Every run reports the seed used to generate its data:

```ts
console.log(data.report);   // { seed: 1846352901, referenceDate, rowCounts, durationMs }
```

Pass a reported seed back to `generate` to reproduce the same dataset:

```ts
const data = await generate({
  schema,
  rules,
  counts,
  seed: 1846352901,
}, createInMemoryGraphSink());
```

## Reproducibility

Random data is only useful if a failure can be replayed. All values generated by drizzle-super-seed derive from one seed, and every generation report includes it. Errors thrown during generation also include the seed.

Relative date generators use a reference date, which is recorded alongside the seed. The same seed, configuration and reference date produce byte-identical output. The PostgreSQL file sink records this information in `manifest.json` as well as returning it in the report.

## Rules

Rules describe how to populate each column. Every insertable column of every generated table must have one of the following:

- a generator
- a literal value
- `structuralDefault`, which asks the library to derive a valid random value from the column definition

The library reads types, nullability, lengths, enum values, foreign keys, unique constraints, generation order and serialisation directly from the Drizzle schema. Rules describe how values should be generated without restating that structural information.

```ts
const lettingRules = {
  holidayHomeId: structuralDefault,           // FK: the engine assigns a real parent
  status: structuralDefault,                  // pgEnum: random pick from the declared values
  guestName: randomWords({ minLength: 8, maxLength: 24 }),
  startDate: structuralDefault,               // date(): drizzle inserts a string, not a Date
  cleaningFee: randomDecimalString(30, 90, 2),
} satisfies TableRules<typeof schema.lettings>;
```

### Schema completeness

Rules mirror the shape of the schema: one rules object per generated table and one rule per column. Drizzle does not provide a way to attach this metadata directly to tables or columns, so some duplication is unavoidable. The supplied types keep the two aligned:

- `TableRules` requires a correctly typed rule for every **insertable** column, including optional and nullable ones.
- `SchemaRules` requires a rules object for every table exported by the schema module.

#### Columns which take no rule

A `GENERATED ALWAYS AS IDENTITY` column is not insertable, and a rule for it is a compile error rather than merely unnecessary. PostgreSQL rejects an insert supplying such a column without `OVERRIDING SYSTEM VALUE`, so Drizzle leaves it out of `$inferInsert` — and `TableRules` is built on `$inferInsert`.

Nothing is lost in the generated data. The engine assigns these values from its own per-table sequence so that foreign keys have something to refer to, and the sinks supply `OVERRIDING SYSTEM VALUE` or the `COPY` equivalent. What is lost is rules-level *control*, deliberately: `GENERATED ALWAYS` is the schema declaring that the database owns the column. Declare [`generatedByDefaultAsIdentity()`](https://orm.drizzle.team/docs/column-types/pg#identity-columns) instead if you want to write rules for it.

An [override](#overrides) can still pin one of these columns, since an override names the exact rows a test needs rather than describing how the column is generated.

```ts
import { structuralDefault, weightedPick } from 'drizzle-super-seed';
import type { SchemaRules, TableRules } from 'drizzle-super-seed';
import * as schema from './schema.ts';

const parkRules = {
  name: parkName(),
  region: weightedPick({ 'south-west': 0.4, wales: 0.3, 'north-east': 0.3 }),
  openedAt: structuralDefault,
  latitude: structuralDefault,
  amenities: structuralDefault,
  active: true,
} satisfies TableRules<typeof schema.parks>;

export const rules = {
  parks: parkRules,
  pitches: pitchRules,
  owners: ownerRules,
  holidayHomes: holidayHomeRules,
  lettings: lettingRules,
} satisfies SchemaRules<typeof schema>;
```

Adding a column to `parks` breaks `parkRules` until a rule is supplied. Adding a table breaks `rules` until its rules object is supplied. The same checks run before generation, giving JavaScript users, and TypeScript users who omit `satisfies`, clear runtime errors before any rows are created.

`structuralDefault` is an explicit declaration that the precise value does not matter. It prevents new columns from being overlooked while avoiding unnecessary custom rules.

### Generators

Generators produce values from the run's seeded random source. They are factories, so configure them when defining the rules rather than once per row.

| Generator | Produces |
|---|---|
| `constant(value)` | the same value every row |
| `randomInteger(min, max)` | uniform integer, inclusive |
| `randomDecimalString(min, max, scale)` | numeric string with exact scale |
| `randomBoolean(probabilityTrue?)` | boolean |
| `randomWords(options?)` | readable random text, length-bounded |
| `randomUuid()` | seed-deterministic version 4 UUID |
| `randomDateBetween(from, to)` | uniform date/timestamp in range |
| `randomTimestampWithinYears(years)` | timestamp within N years of the reference date |
| `pickFrom(items)` | uniform pick |
| `optional(generator, nullProbability?)` | wraps a generator; null some of the time |
| `sequence(build)` | `build(rowIndex)`: guaranteed-unique values without retries |
| `derive(build)` | computed from the row's earlier columns |
| `unique(generator, options?)` | retries the generator until unused (100 attempts, then throws with the seed) |
| `selfReference(options?)` | for self-referencing FKs; see [Self-references](#self-references-and-cycles) |

Shaped distributions:

| Generator | Produces |
|---|---|
| `weightedPick(weights)` | categorical values with relative weights |
| `weightedPickFrom(entries)` | weighted pick over arbitrary values |
| `zipfInteger(min, max, skew?)` | a few large values and a long tail (pitch counts, letting volumes) |
| `normalInteger(mean, stdDev, clamp?)` | bell-curved integers |

Use `derive` when one column depends on another in the same row, for example `endDate` from `startDate`. It can only read columns declared earlier in the rules object. Reading a later column throws a `ColumnOrderError` which identifies both columns.

Use `sequence` for high-cardinality unique values where possible. Unlike `unique`, it does not rely on retries and cannot exhaust:

```ts
const ownerRules = {
  id: structuralDefault,
  fullName: randomWords({ minLength: 8, maxLength: 24 }),
  email: sequence((index) => `owner-${index}@example.com`),
  memberSince: structuralDefault,
  referredByOwnerId: structuralDefault,
} satisfies TableRules<typeof schema.owners>;
```

### Async lookups

Some realistic data depends on an external source, such as a file containing valid postcodes. Load this data once through `lookups`, then use it synchronously from any generator:

```ts
const parkRules = {
  ...structuralParkRules,
  region: derive((_row, context) => context.random.pick(context.lookups.postcodes as string[])),
} satisfies TableRules<typeof schema.parks>;

await generate(
  {
    schema,
    rules: { ...rules, parks: parkRules },
    counts,
    lookups: { postcodes: () => loadPostcodeSample() },
  },
  createPostgresSqlFileSink({ directory: 'docker/initdb' }),
);
```

Lookup functions are resolved before generation starts. The row generation loop remains synchronous, which avoids performing I/O for every row.

### Realistic names with faker

drizzle-super-seed deliberately does not depend on [@faker-js/faker](https://fakerjs.dev/), but works with it. Choose one seed, give it to both libraries, and call faker inside `derive` rules:

```ts
import { faker } from '@faker-js/faker';
import { derive, generate, createInMemoryGraphSink, structuralDefault } from 'drizzle-super-seed';
import type { TableRules } from 'drizzle-super-seed';
import * as schema from './schema.ts';

const seed = Number(process.env.SEED ?? Date.now());
faker.seed(seed);

const ownerRules = {
  id: structuralDefault,
  fullName: derive(() => faker.person.fullName()),
  email: sequence((index) => `owner-${index}@example.com`),
  memberSince: structuralDefault,
  referredByOwnerId: structuralDefault,
} satisfies TableRules<typeof schema.owners>;

const data = await generate({ schema, rules, counts, seed }, createInMemoryGraphSink());
```

Rules evaluate in a deterministic order for a fixed configuration, so seeding faker once produces reproducible results. To replay a failure, rerun with the reported seed: `SEED=1846352901 npm test`.

This integration requires an explicit seed. faker cannot discover a seed which drizzle-super-seed generated internally.

## Overrides

Overrides let a test control selected values while leaving everything else random. Supply an array of partial rows for a table. Each item applies to the generated row at the same index:

```ts
const data = await generate({
  schema,
  rules,
  counts: { owners: 2 },
  overrides: {
    owners: [
      { fullName: 'Alice Morgan' },
      { fullName: 'Ben Patel' },
    ],
  },
}, createInMemoryGraphSink());
```

Overrides are most useful for values which affect the behaviour under test, including statuses, boundary dates and specific relationships. They should generally remain partial so that incidental data continues to vary.

Three things to know about overrides:

- **An override changes the rest of the dataset.** A pinned column does not draw from the random
  source, so every value generated after it moves. Pin the seed and the overrides together, and
  expect the data to shift when you add or remove one.
- **Overrides index the table, not the parent.** `overrides.pitches[0]` is the first pitch of the
  whole run, not the first pitch of the first park.
- **Nothing warns you about an override which does not apply.** An override for a table with no
  count, a key which is not a column, or an index beyond the number of rows generated is silently
  unused. Check the count before assuming the test data is wrong.

## Counts and shape

Counts decide which tables are generated, how many rows they contain and, optionally, how child rows are distributed between parents. Tables omitted from `counts` are not generated.

A count can take one of two forms:

- A number sets the total rows for the table. Foreign keys select from the available generated parents.
- A per-parent rule generates a number of child rows for each parent. This supports realistic distributions, such as a few parks with hundreds of pitches and a long tail with only a handful.

```ts
const productionCounts = {
  parks: 60,
  pitches: { per: 'parks', count: zipfInteger(20, 600) },
  owners: 40_000,
  holidayHomes: { per: 'pitches', count: weightedPickFrom([{ value: 0, weight: 1 }, { value: 1, weight: 9 }]) },
  lettings: { per: 'holidayHomes', count: normalInteger(6, 4, { min: 0, max: 40 }), retain: ['siteFee'] },
};
```

With `per`, each child is generated for a specific parent and its foreign key is set accordingly. `retain` lists parent columns which child generators can read through `ctx.parentRow`. For example, a letting date could be constrained by the date its park opened, or a fee could be derived from the parent's fee band.

Pick one form per table. To see the difference, suppose 10 parks have been generated:

- `pitches: 100` creates exactly 100 pitches. Each pitch selects one of the 10 parks at random. A park receives 10 pitches on average, but one might receive 14 and another 6. The total is fixed; the distribution is random.
- `pitches: { per: 'parks', count: randomInteger(5, 15) }` visits each park, chooses a number between 5 and 15, and creates that many pitches for it. The range per park is fixed; the final total is random.

You cannot fix both values at once. "Exactly 100 pitches, with between 5 and 15 per park" is over-constrained. Choose whether the total or the per-parent distribution matters.

Neither form creates orphan rows. A non-nullable foreign key always refers to a generated parent. A nullable foreign key is only null because of its rule or an override. Asking for child rows when no parents exist throws `EmptyParentPoolError` before anything is written.

Counts can therefore remain separate from the rules. A unit test can use a handful of rows while a production-scale script uses millions, without changing how individual values are generated.

### Pinning the shape

Random foreign key assignment is useful for volume tests, but some tests require an exact structure. Combine per-parent counts and overrides to control it:

- A per-parent count using `constant` gives every parent the same number of children: `lettings: { per: 'holidayHomes', count: constant(2) }`.
- An override can set a foreign key directly. Sequence-owned primary keys are deterministic (1, 2, 3 in generation order), so their IDs are known in advance. UUID primary keys can be overridden with known values.

```ts
const data = await generate({
  schema,
  rules,
  counts: { parks: 1, pitches: 2, owners: 2, holidayHomes: 2, lettings: 3 },
  overrides: {
    lettings: [
      { holidayHomeId: 1 },   // two lettings on the first home
      { holidayHomeId: 1 },
      { holidayHomeId: 2 },   // one on the second
    ],
  },
}, createInMemoryGraphSink());
```

## Sinks

A sink receives the generated rows and decides what to do with them. This keeps generation rules independent of storage and allows the same rules to support unit tests, integration tests and large database loads.

Pass a sink as the second argument to `generate(config, sink)`. The return value is whatever the sink's `end` method produces.

### createInMemoryGraphSink: unit tests

Use the in-memory graph when a test does not need a database. It returns every generated row and provides helpers for navigating relationships:

```ts
const data = await generate({ schema, rules, counts }, createInMemoryGraphSink());

const pitch = data.rows.pitches[0];
const park = data.parentOf('pitches', pitch, 'parkId');       // the exact park row, or null
if (!park) throw new Error('every pitch has a park');
const pitches = data.childrenOf('parks', park, 'pitches');    // all of that park's pitches
```

### createRowBatchSink: integration tests

Use the row batch sink when a test needs to insert data through a real Drizzle connection. drizzle-super-seed supplies ordered batches to your handler, leaving connection and transaction management to you. Parent rows arrive before their children, so foreign key constraints can remain enabled:

```ts
import type { PgTable } from 'drizzle-orm/pg-core';

await generate({ schema, rules, counts }, createRowBatchSink(async ({ table, rows, overrideSystemValue }) => {
  if (overrideSystemValue) {
    await db.insert(table as PgTable).overridingSystemValue().values(rows);
    return;
  }
  await db.insert(table as PgTable).values(rows);
}));
```

For a table containing a `GENERATED ALWAYS AS IDENTITY` column, `overrideSystemValue` is `true`. PostgreSQL rejects explicit IDs in an ordinary insert, so the handler must use Drizzle's `.overridingSystemValue()` modifier.

Schemas containing foreign key cycles between tables also require a second handler for deferred updates. See [Self-references and cycles](#self-references-and-cycles).

The handler can retain each batch while inserting it, giving the test access to the exact rows in the database:

```ts
const inserted: Record<string, Record<string, unknown>[]> = {};

await generate({ schema, rules, counts, overrides }, createRowBatchSink(async ({ tableKey, table, rows }) => {
  (inserted[tableKey] ??= []).push(...rows);
  await db.insert(table as PgTable).values(rows);
}));

const home = inserted.holidayHomes[0];
```

### createPostgresSqlFileSink: bulk load

Use the PostgreSQL file sink when one generated dataset will be loaded several times, for example when building a shared test database image. It writes a directory of SQL files using `COPY ... FROM stdin`. Generation does not require a database connection:

```ts
import { generate, createPostgresSqlFileSink } from 'drizzle-super-seed';

const report = await generate(
  { schema, rules, counts: productionCounts, seed: 42 },
  createPostgresSqlFileSink({ directory: 'docker/initdb' }),
);
```

The generated directory contains:

```
docker/initdb/
  load.psql              # loads the files into a remote database
  010_parks.sql          # one file per table, in foreign-key-safe order
  020_pitches.sql
  ...
  900_finalise.sql       # updates sequences and runs ANALYZE
  manifest.json          # records how the dataset was generated
```

`manifest.json` records the seed, reference date, row counts, trigger handling, generated files and duration. Use it to reproduce the files or verify the row counts after loading.

The directory supports two common loading methods.

#### Build a Docker image

The numbered SQL files can be copied directly into PostgreSQL's `/docker-entrypoint-initdb.d` directory:

```dockerfile
FROM postgres:18
COPY docker/initdb/*.sql /docker-entrypoint-initdb.d/
```

Build the image once in CI to give developers and pipelines the same production-shaped starting point.

#### Load a remote database

Use the generated `load.psql` file to load the directory through one connection:

```sh
psql "$CONNECTION_STRING" -f docker/initdb/load.psql
```

By default, each table file sets `session_replication_role = replica` for its session, disabling triggers and foreign key enforcement during the load. The generated data is valid by construction, and omitting these checks improves load performance.

This setting requires superuser rights, which managed services such as RDS, Cloud SQL and Neon do not normally provide. Set `triggerHandling: TriggerHandling.LeaveEnabled` to keep triggers and foreign key checks enabled. The load will remain correct, but will be slower.

`900_finalise.sql` moves every sequence beyond its highest generated ID and runs `ANALYZE`. Subsequent inserts therefore receive unused IDs, and the query planner receives statistics for the loaded data.

The files must be run by `psql`, or by the Docker entrypoint which uses it. Inline `COPY ... FROM stdin` is a `psql` capability rather than generic SQL which a database driver can execute.

### createPostgresSqlStreamSink: streaming bulk load

Use the stream sink when the generated data will be loaded once and does not need to be retained. It writes the same SQL as one continuous script to any Node.js `Writable`, including a file, an upload stream or standard output. It does not create an orchestrator or manifest, but still returns the generation report.

```ts
await generate({ schema, rules, counts, seed }, createPostgresSqlStreamSink({ writable: process.stdout }));
```

```sh
node generate-production-data.js | psql "$CONNECTION_STRING"
```

You can also spawn `psql` and pass its standard input directly to the sink. This avoids writing to disk and allows PostgreSQL to ingest rows while they are still being generated:

```ts
import { spawn } from 'node:child_process';

const psql = spawn('psql', [connectionString, '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'inherit', 'inherit'] });

const report = await generate({ schema, rules, counts, seed }, createPostgresSqlStreamSink({ writable: psql.stdin }));

psql.stdin.end();
const code = await new Promise((resolve) => psql.on('close', resolve));
if (code !== 0) throw new Error(`psql exited with code ${code}`);
```

The sink does not end the writable. The caller owns the stream and is responsible for ending it and checking the exit code.

Use streaming for one-off loads, such as CI seeding a temporary database. Use the file sink when the same generation will feed several loads.

Both PostgreSQL sinks generate rows as a stream, so memory use remains broadly constant as row counts increase. There is deliberately no option to return all generated SQL as one string, which could consume several gigabytes at production volumes.

### createMariaDbSqlFileSink: bulk load

The MariaDB equivalent of the PostgreSQL file sink. It writes numbered, self-contained table files
of extended `INSERT` statements, a `900_finalise.sql` running `ANALYZE TABLE`, a `load.mysql`
orchestrator, and a `manifest.json`.

```ts
await generate({ schema, rules, counts, seed: 42 }, createMariaDbSqlFileSink({ directory: 'docker/initdb' }));
```

Load them with the `mysql` or `mariadb` client, either file by file — which is what the MariaDB
Docker image's `/docker-entrypoint-initdb.d` does — or in one invocation:

```sh
mariadb -u user -p database -e 'source load.mysql'
```

Differences from the PostgreSQL sink, all following from MySQL rather than from choice:

- Each file opens a transaction and sets `foreign_key_checks = 0` and `unique_checks = 0`. Both are
  ordinary session settings, so no superuser is needed and there is no `TriggerHandling` option.
- Rows are written as extended `INSERT` statements, 1,000 per statement by default. Raise
  `rowsPerStatement` for slightly smaller files and slightly faster loads, but keep the resulting
  statement inside the server's `max_allowed_packet` (64 MB by default); the manifest records the
  size used.
- There is no sequence fix-up file. InnoDB advances `AUTO_INCREMENT` past explicitly inserted ids by
  itself.
- The orchestrator is `load.mysql` rather than `load.psql`, kept outside the Docker image's `*.sql`
  glob for the same reason: so the numbered files load once rather than twice.

String values are written as single-quoted literals with `'` doubled and backslash, newline, carriage return, tab and NUL backslash-escaped. That is correct under MySQL's default `sql_mode`, and the escaping is proved against a real server rather than only against its own expectations. A server running **`NO_BACKSLASH_ESCAPES`** reads those escapes literally and would load such values corrupted — silently, since nothing is rejected. `mysqldump` output has exactly the same exposure; if your target runs that mode, load through a client session which does not.

### Custom sinks

Implement `GenerationSink` when the built-in outputs do not fit. A custom sink could write NDJSON or CSV, publish to a queue, or load another database.

```ts
import type { GenerationSink, GenerationReport } from 'drizzle-super-seed';

const ndjsonSink: GenerationSink<GenerationReport> = {
  writeRows: (table, rows) => rows.forEach((row) => out.write(`${JSON.stringify({ table: table.name, row })}\n`)),
  end: (report) => report,
};

const report = await generate({ schema, rules, counts }, ndjsonSink);
```

`writeRows` and `end` are required. `beginTable`, `endTable` and `writeDeferredUpdates` are optional. A sink without `writeDeferredUpdates` rejects schemas containing foreign key cycles during validation, before generation starts.

## Schema support

Schema introspection and direct row generation are supported across PostgreSQL, MariaDB and SQLite. Bulk SQL output is dialect-specific because each database has different loading capabilities.

### Databases

Most of the library is database-agnostic. The in-memory graph sink needs no database at all, and the row batch sink hands rows to whatever drizzle instance you give it. Only two pieces are dialect-specific: the schema adapter that introspects your tables, and the bulk SQL file sinks.

|                    | PostgreSQL       | MariaDB                | SQLite |
|--------------------|------------------|------------------------|--------|
| Schema adapter     | ✓                | ✓                      | ✓      |
| Bulk SQL file sink | ✓ (`COPY`, psql) | ✓ (extended `INSERT`)  | none   |

The dialect is detected from the schema module. Using an incompatible file sink produces a validation error before generation starts.

There is deliberately no SQLite file sink. SQLite is embedded, so there are no network round trips to avoid, and batched inserts within one transaction are already fast. If you need a reusable database artefact, generate directly into a SQLite file and retain the resulting `.db` file.

### Database names

Database names come from the Drizzle schema. If your `drizzle()` instance uses `casing: 'snake_case'` instead of explicit database names, include the same setting in the generation configuration. drizzle-super-seed cannot read it from the driver:

```ts
import { IdentifierCasing } from 'drizzle-super-seed';

await generate({ schema, rules, counts, casing: IdentifierCasing.SnakeCase }, createInMemoryGraphSink());
```

### Identity and serial columns

Identity and serial columns are supported, including `GENERATED ALWAYS AS IDENTITY`. Explicit IDs are generated so that foreign keys can refer to them. PostgreSQL `COPY` accepts these values, and the finalisation script updates the corresponding sequences afterwards.

A `GENERATED ALWAYS AS IDENTITY` column takes no rule — see [Columns which take no rule](#columns-which-take-no-rule).

When using the row batch sink, tables which require `.overridingSystemValue()` are identified in the batch metadata.

### Self-references and cycles

Self-referencing foreign keys and cycles require the generator to decide when the relationship can be assigned safely.

A nullable self-referencing foreign key, such as `owners.referredByOwnerId` referencing `owners.id`, works without deferred updates. Each row can only refer to an earlier row, producing a tree-shaped relationship which remains valid while foreign key enforcement is enabled. Control the proportion of root rows with `selfReference({ nullProbability })`.

For a cycle between different tables, such as `parks.wardenId` referencing `staff` while `staff.parkId` references `parks`, the generator temporarily breaks the cycle at a nullable edge. It creates that value as `NULL`, then assigns the relationship in a second pass. The graph sink updates the in-memory row, the row batch sink sends deferred update batches to a second handler, and the PostgreSQL sink writes a set-based `UPDATE` file.

A cycle in which every foreign key is non-nullable is rejected. No row in such a cycle can be inserted first, so at least one edge must be nullable.

The deferred column is assigned by the engine, so **a rule written for it is never evaluated** —
neither in the first pass, where the column is `NULL`, nor in the second, which picks from the
now-complete pool. An override on a deferred column *is* honoured, in the second pass. If you need
control over a deferred relationship, override it.

A sink which cannot apply the second pass is rejected before any row is generated, so a cyclic
schema never loads half-assigned.

### Limits

- Databases per the [matrix](#databases); no SQLite file sink, by design.
- Composite primary keys and unique constraints are supported. Composite foreign keys are not. Use a single-column surrogate primary key on the parent and retain the natural key as a unique constraint.
- Array columns and exotic types are rejected with a clear error naming the column.
- Binary columns (`binary`, `varbinary`, `blob`) are rejected the same way, in every dialect. Generating readable words into a column that means bytes would be worse than refusing.
- No incremental seeding into a database that already has data.

### Why there is no SQLite file sink

drizzle-super-seed generates bulk SQL files for PostgreSQL and MariaDB, and deliberately does not for SQLite.

The bulk file sinks exist to avoid network round trips: `COPY` and extended `INSERT`s move millions of rows to a server in one stream, which ORM inserts cannot match. SQLite is embedded, so there are no round trips to avoid. A single transaction of inserts through `createRowBatchSink` is already the fast path, and a file sink would add surface without adding speed.

To bake a SQLite artefact, generate into a file-backed database and commit the file:

```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { createRowBatchSink, generate } from 'drizzle-super-seed';

const database = new Database('fixtures/park.db');
database.pragma('foreign_keys = ON');
const db = drizzle({ client: database });

await generate(
  { schema, rules, counts, seed: 42 },
  createRowBatchSink((batch) => {
    db.insert(batch.table as SQLiteTable).values(batch.rows).run();
  }),
);
database.close();
```

### Errors

Every error extends `GenerationError`, carries structured fields as well as a message, and names the
table and column as your schema declares them rather than as the database does. Most fire before any
row is generated.

| Error | Raised when |
|---|---|
| `UnsupportedColumnTypeError` | a column's type has no generator, naming the drizzle type |
| `UnsupportedRelationshipError` | a foreign key spans more than one column |
| `IncompleteSchemaError` | a foreign key points at a table missing from the schema module |
| `MissingPrimaryKeyError` | a table has no primary key to reference its rows by |
| `MixedDialectError` | one schema module mixes PostgreSQL, MariaDB or SQLite tables |
| `WrongDialectError` | a single-dialect sink is given a schema of another dialect |
| `CircularDependencyError` | every foreign key in a cycle is `NOT NULL` |
| `MissingTableRulesError` | a counted table has no rules object |
| `MissingColumnRuleError` | a rules object omits a column |
| `UnknownColumnRuleError` | a rules object names a column the table does not have |
| `UnknownCountTableError` | `counts` names a table the schema does not have |
| `MissingParentCountError` | a foreign key's parent table has no count |
| `InvalidPerParentError` | a `per` count names the table itself, a table it does not reference, or one it references twice |
| `NotNullSelfReferenceError` | a `NOT NULL` foreign key points at its own table |
| `EmptyParentPoolError` | a `NOT NULL` foreign key's parent generated no rows |
| `ColumnOrderError` | a `derive` rule reads a column generated later in the row |
| `UniqueValueExhaustedError` | `unique()` ran out of attempts |
| `UniqueConstraintExhaustedError` | a unique constraint's value space is smaller than the row count |
| `UnserialisableValueError` | a value cannot be written to a bulk file, naming the column |
| `AmbiguousRelationshipError` | `childrenOf` has more than one foreign key to choose between |
| `OutputDirectoryNotEmptyError` | a file sink's output directory already holds something |
| `TooManyOutputFilesError` | a run needs more numbered files than the sequence has room for |
| `DeferredUpdatesUnsupportedError` | a cyclic schema meets a sink which cannot apply deferred updates |

Errors raised once generation has started carry the `seed` in their message, so a failure can be
replayed exactly. The two bulk serialisers are pure functions and name the column instead.

## Comparison with drizzle-seed

[drizzle-seed](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-seed) generates shaped data from a Drizzle schema and works well for modest volumes inserted directly into a live database. drizzle-super-seed is intended for cases where you also need:

- in-memory data for unit tests which do not use a database
- SQL files or streams for high-volume bulk loads
- compile-time and runtime checks requiring every schema change to be acknowledged by the generation rules

In informal testing, PostgreSQL `COPY` was roughly four times faster per row than direct inserts before batching and temporarily disabling constraint checks widened the difference. SQL file support in drizzle-seed is [tracked upstream](https://github.com/drizzle-team/drizzle-orm/issues/4133).

## Use with drizzle-explain

Query plans are only meaningful against production-shaped data; a missing index looks free against a hundred rows. Use drizzle-super-seed to bake that data into a disposable database, and [drizzle-explain](https://github.com/cressie176/drizzle-explain) to assert your Drizzle queries stay on good plans against it.

## Worked example

The [examples](examples) directory holds five self-contained demonstrations of one holiday-park domain (parks, pitches, holiday homes, owners, lettings), each a private workspace package you can read — or copy — on its own:

| Example | Shows |
|---|---|
| [`examples/in-memory`](examples/in-memory) | Unit tests over a navigable `DataGraph`, no database |
| [`examples/batch-insert`](examples/batch-insert) | Ordered batches through your own drizzle `db.insert`, constraints enforced |
| [`examples/postgres`](examples/postgres) | Bulk `COPY` files baked into a Postgres image by a two-line Dockerfile |
| [`examples/mariadb`](examples/mariadb) | Extended `INSERT` files loaded through `mysql2` |
| [`examples/sqlite`](examples/sqlite) | A complete file-backed `.db` built through the row batch sink |

They share the domain and the faker-driven generators, but each dialect declares its own schema module — `pgTable`, `mysqlTable` and `sqliteTable` are different constructors, and a module mixing them is rejected with `MixedDialectError`. There is no hand-written DDL anywhere: every database an example touches is created from its drizzle schema by `drizzle-kit generate`.

Realistic values come from the faker pattern above: `faker.seed(seed)` once, the same `seed` passed to `generate`, faker called inside `derive` rules. One caveat the examples' tests demonstrate: faker's stream continues across runs within one process, so anything calling `generate` more than once must re-seed faker between runs to replay a dataset.

Every code block in this README is compiled against the published types by the test suite, via the [`examples/readme`](examples/readme) harness package.

## License

MIT
