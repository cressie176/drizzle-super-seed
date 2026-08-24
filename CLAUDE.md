# Claude Code: drizzle-super-seed

You are implementing `drizzle-super-seed`, a test data generator for Drizzle ORM schemas.
The complete design and the ordered user stories live in [DESIGN.md](DESIGN.md). That
document is the specification; this file tells you how to work through it.

## How to work

- **One story at a time, in order.** Do not start a story until its `Depends on` stories
  are complete. Do not implement ahead of the current story, even when you can see what
  is coming: no speculative abstractions, no unused parameters "for later".
- **Before writing code for a story**, re-read the design sections it references
  (each story cites them, e.g. §3.14 for the psql sink). The story's tasks are the plan;
  the design section is the contract.
- **Acceptance criteria are the definition of done.** Every criterion must be
  demonstrated by an automated test that would fail if the behaviour regressed. A story
  with passing tests but an unmet criterion is not done. Do not weaken, skip, or delete
  an existing test to get a new one passing.
- **Test-first where the design says so.** S03 starts with the introspection spike test;
  S12 encodes the escaping rules as a test table before the serialiser exists. For other
  stories, write the acceptance-criteria tests early enough that they drive the design
  of the code, not merely confirm it.
- **Finish each story cleanly**: `npm run format`, `npm run lint`, `npm run build`,
  `npm test` (and the integration suite when the story touches a sink or the adapter)
  all green. One commit (or one small series) per story, message prefixed with the
  story id, e.g. `S07: value generator primitives`.
- **Track progress in the issues.** Every story is an issue in
  `cressie176/drizzle-super-seed`, and story `SNN` is issue `#NN`. Tick each task as you
  complete it, tick the definition-of-done boxes as they are met, and close the issue as
  the last act of the story. DESIGN.md is a local working document and is not committed,
  so the issue is the only record anyone else can see; keep it current as you go rather
  than reconstructing it at the end.

## When to stop and ask the maintainer

Stop and report, rather than silently deviating, when:

- An acceptance criterion is impossible or contradicts the design as written.
- The installed `drizzle-orm`'s actual behaviour differs from the design's assumptions
  (expected in S03: correct the §3.2 mapping table from spike-test evidence and say so
  in the commit message; anything beyond the mapping table, ask first).
- You believe a production dependency is warranted (see below).
- Two design sections conflict, or a story's tasks and criteria disagree.

A short note stating the conflict, the options, and your recommendation is the
deliverable in these cases, not a workaround.

## Dependencies

**Zero production dependencies.** `drizzle-orm` is a peer dependency; everything else
comes from the Node.js standard library. This is a deliberate stance on maintenance and
supply-chain risk, not an oversight.

Before reaching for a library, estimate the size of a hand-rolled implementation. Every
algorithm this project needs is small: Kahn's topological sort is ~20 lines, mulberry32
is ~5, Box–Muller is ~10, zipf via inverse CDF over precomputed harmonic weights is ~15.
At that scale a dependency costs more in review and risk than it saves. Implement it,
with tests that pin the behaviour.

If you genuinely encounter something complex enough that a hand-rolled version would be
large and subtle (say, over ~200 lines of algorithmic code with real correctness risk),
do not add the dependency yourself. Stop and propose it: what it is, why hand-rolling is
worse, its maintenance record, and its transitive dependency count. The maintainer
decides. Dev dependencies are fixed by story S01; do not add others without asking.

## Code conventions

DESIGN.md §5 is binding. The rules most often violated by generated code, restated:

- **The library is plain CommonJS JavaScript.** Implementation in `lib/` with
  `require`/`module.exports`, no build step, the drizzle-transact/drizzle-explain
  pattern. TypeScript exists only in the hand-written `lib/index.d.ts`, the
  `test/types/` fixtures, and `examples/`. Enums are frozen objects at runtime with a
  matching `export enum` in the d.ts.
- **Avoid `else` and `switch`.** Guard clauses that return or throw early are fine.
  Forks in behaviour normally become lookup maps of named functions (drizzle-transact's
  `dispatch.js` pattern (e.g. column kind to formatter), not conditional chains. A
  trivial two-way fork, or an exceptional case where the alternatives are genuinely
  worse, may keep its `else`; treat that as the exception, not a loophole.
- **Avoid boolean parameters.** Prefer two named functions, an enum, or a named option;
  a trivial or exceptional case may pass a boolean when the alternatives are more
  convoluted. Boolean fields on data objects are fine.
- **Very small functions.** If you feel a comment coming on, extract a named function
  instead. The only acceptable comments explain why irreducibly confusing code cannot
  be simpler (COPY escaping order, Box–Muller).
- **Encapsulate.** Export exactly the public API in DESIGN.md §4. Everything else stays
  module-private, even when exporting would make a test easier. Test through the
  public surface or move the test into the module's own test file.
- **The d.ts is a first-class deliverable; never weaken it.** No `any`, no
  `as unknown as`, no loosening `TableRules` to `Record<string, unknown>`. Update
  `lib/index.d.ts` in the same commit as the behaviour it declares. If the types won't
  compose, that is a design signal: stop and ask. The type-level tests (S06) are as
  mandatory as runtime tests.
- **Intent-revealing names**; no `utils`, `helpers`, `common`, `types` grab-bag files.
  Use the file names given in DESIGN.md §3.
- **British English** in identifiers, messages, and docs (`serialisation`, `finalise`).

## Testing conventions

- **No mocks.** Pure layers are tested with real Drizzle table definitions and exact
  expected values; sinks are tested against the real PostgreSQL from
  `docker-compose.yml`. A plain in-memory recorder implementing `GenerationSink` is a
  test double, not a mock, and that is fine.
- **House test style.** `node:test` with `describe`/`it`, aliased asserts
  (`const { equal: eq, deepEqual: deq, rejects } = require('node:assert')`), shared
  helpers under `test/lib/`, integration tests named `*.integration.test.js`, the
  whole suite run serially by `npm test` with the database already up
  (`npm run db:up`).
- **Determinism over statistics.** Prefer golden-value tests under a fixed seed. Where
  a distribution must be asserted statistically, use a fixed seed, a large sample, and
  a generous tolerance so the test can never flake.
- **Error tests assert the message content** (table, column, constraint, seed), not
  just the error class; the messages are part of the contract.

## Reproducibility discipline

Never use `Date.now()`, `new Date()` without arguments, or `Math.random()` inside the
generation path. All randomness flows from the injected `RandomSource`; all "now"
references flow from `referenceDate`. If you need either somewhere new, thread it in as
a parameter.
