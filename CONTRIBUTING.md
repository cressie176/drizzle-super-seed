# Contributing to drizzle-super-seed

## Architecture

One entry point, three seams. `generate(config, sink)` extracts a **canonical model** from the
drizzle schema module, resolves rules into a generation plan, streams rows to the sink in
dependency order, and runs a deferred second pass for cyclic schemas.

| Module | Responsibility |
|---|---|
| lib/drizzle-schema-adapter.js | Dialect-neutral extraction into the canonical model |
| lib/postgres, lib/mariadb, lib/sqlite | One module per dialect behind a small seam: isTable, tableConfig, columnKind, sequenceOwned, identityAlways, valueRange, sequenceName, detail |
| lib/declared-relations.js | relations() declarations, resolved drizzle-strict, never rejecting a schema |
| lib/table-dependency-order.js | Kahn's ordering; cycles broken into deferred foreign keys |
| lib/generation-rules.js | Rule resolution, structural defaults, eager validation |
| lib/generation-engine.js | The row loop: pools, per-parent counts, unique tracking, overrides, the deferred pass |
| lib/value-generators.js, lib/distribution-generators.js | Generator factories, validated at authoring time by lib/generator-configuration.js |
| lib/in-memory-graph-sink.js, lib/row-batch-sink.js, lib/csv, lib/postgres, lib/mariadb | The sinks, each implementing the GenerationSink contract in lib/index.d.ts |

The **canonical model** is the load-bearing abstraction: everything downstream of the adapter
works from it, never from drizzle objects. The **sink contract** is deliberately small
(prepare, beginTable, writeRows, endTable, writeDeferredUpdates, end); a sink that cannot
express the deferred pass simply omits writeDeferredUpdates and cyclic schemas are refused
before anything is written. The engine retains in memory only what later tables need: the
values of referenced columns for foreign key pools, primary key tuples where a per-parent
count or deferred pass demands them, and columns a per-parent rule retains.

## Code conventions

- **Plain CommonJS in lib/**, no build step. TypeScript exists only in the hand-written
  lib/index.d.ts, test/types/ and examples/.
- **The d.ts is a first-class deliverable.** No any, no as-casts, and it imports nothing from
  drizzle: its types are structural, so they survive every module resolution (see the comment
  on SchemaRules for the failure this prevents).
- **Avoid else and switch.** Guard clauses that return or throw early; forks become lookup
  maps of named functions (see the serialisers' formatter maps).
- **Avoid boolean parameters**: two named functions, an enum, or a named option. Boolean
  fields on data objects are fine.
- **Very small functions.** If a comment is coming on, extract a named function instead. The
  only acceptable comments explain why irreducibly confusing code cannot be simpler.
- **Encapsulate.** Export exactly the public API in lib/index.d.ts; everything else stays
  module-private, even when exporting would make a test easier.
- **Zero production dependencies.** drizzle-orm is a peer dependency; every algorithm here is
  small enough to own (mulberry32 is five lines, the topological sort twenty). Propose a
  dependency in an issue rather than adding one.
- **British English** in identifiers, messages and docs. No em-dashes, and no backticks
  inside markdown tables.

## Testing conventions

- node:test with describe/it, aliased asserts, shared helpers under test/lib/, the whole
  suite serial via npm test with the compose databases up (npm run db:up).
- **No mocks.** Pure layers are tested with real drizzle definitions and exact expected
  values; sinks against the real PostgreSQL and MariaDB from docker-compose.yml. An in-memory
  recorder implementing GenerationSink is a test double, not a mock, and that is fine.
- **Determinism over statistics**: golden values under a fixed seed; where a distribution
  must be asserted statistically, a fixed seed, a large sample and a generous tolerance.
- **Error messages are part of the contract**: error tests assert the message content, and a
  README test keeps the error table complete in both directions.
- **Serialisation is proved against real servers**, awkward values compared back as hex, and
  every escaping rule was written as a failing test before its serialiser existed. Keep it
  that way: when a check is load-bearing, break the code and watch the test fail.

## Reproducibility discipline

Never use Date.now(), argument-less new Date(), or Math.random() inside the generation path.
All randomness flows from the injected RandomSource, all "now" from referenceDate; thread them
in as parameters if a new site needs either. Nothing may consume a random draw conditionally:
every generator draws the same numbers from the stream whatever the row contains, or replay
under a reported seed breaks.

## Decisions

Decisions of record live in the closed GitHub issues, each closed with a comment stating what
was decided, why, and what evidence settled it. When behaviour is deliberately surprising, the
reasoning also lives as a comment at the point of use. If you find yourself writing "cannot"
in a proposal, check whether you mean "chose not to": a genuine cannot deserves a probe or a
named mechanism in the same breath, and a chose-not-to deserves the alternative sketched so
the maintainer can overrule cheaply.

## Gates

npm run lint (biome check: lint, format and import order, exactly what CI enforces), npm run
typecheck, npm test, and npm run examples:test all green before a commit; the pre-commit hook
runs them. Image-touching changes: npm run examples:image.
