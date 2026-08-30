# Changelog

All notable changes to drizzle-super-seed are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- A CHECK constraint naming only foreign key and engine-numbered columns was invisible to the
  rule refusal: the refusal exempts such columns because a parent reference is not a guess, so
  nobody was asked for a rule and the first sign of trouble was the database rejecting a COPY
  mid-load, or an orphan only a post-load audit catches. Found by the MusicBrainz validation
  (#41, decided in #64), whose non_loop_relationship (entity0 <> entity1) appears on fourteen
  relationship tables and whose tag_relation orders a pair of foreign keys. structuralDefault
  on a foreign key named by such a check now raises
  CheckConstrainedForeignKeyRuleRequiredError, naming the constraint, quoting the predicate and
  listing the foreign keys whose rules must keep the references valid together, such as row
  numbers into their parent tables. A check which also names an ordinary column keeps the
  exemption, since that column's own refusal already puts the constraint in front of the user.

- An integer array element generated at the full default integer range because the canonical
  element description dropped the column type's value range, so a structural default for
  smallint[] produced values PostgreSQL rejects with "out of range for type smallint". Found
  seeding MusicBrainz (#41), whose artist_release_group partitions carry two smallint[] columns.
  The element description now carries the range and the structural default generates within it,
  exactly as it already did for the scalar column. Ported from f12520e on drizzle-1.0.0-rc,
  which additionally covers the drizzle-orm 1.0.0 flattened element path that branch carries.

## [0.2.0] - 2026-08-28

### Added

- Composite foreign keys are recorded in the canonical model rather than refused: they order
  the load and the UNLOGGED file, relations() navigation over them works, and a dependency
  cycle whose only candidates are composite edges is refused, since a tuple cannot be
  half-patched by the deferred pass. structuralDefault on a member column raises
  CompositeForeignKeyRuleRequiredError naming the tuple and the remedy: write rules that keep
  it valid together, as the AdventureWorks example demonstrates.

- A worked example for every sink: `examples/sinks/postgres-stream` completes the set, streaming a
  production-shaped load into a spawned psql with no intermediate files.
- `examples/real-world/adventureworks` seeds a real 68-table, five-schema, 90-check database introspected
  from a live server, alongside the existing Pagila example.
- **Two drizzle-native examples**, seeding schemas written by hand rather than introspected.
  `examples/real-world/lobechat` is 165 PostgreSQL tables and 2228 columns, exercising arrays,
  vectors, composite foreign keys and 24 CHECK constraints, and loading into a real pgvector
  server. `examples/real-world/bangumi` is 61 MySQL tables which declare no foreign keys, no
  unique constraints and a primary key on only 3 of them, with 65 `customType` columns wrapping
  ordinary SQL types. Both fetch their schema from a pinned upstream commit rather than vendoring
  it, neither repository's licence permitting redistribution, and both found library defects
  worth fixing: the composite primary key nullability below, and the CHECK constraint refusal
  above.

- **PostgreSQL array columns are supported**, at any depth, as `ColumnKind.Array` carrying a
  recursive element description derived through the existing dialect seams: a `varchar(64)[]`
  keeps its length and a `pgEnum(...).array()` keeps its values. `structuralDefault` generates a
  short array of element values, rectangular at every level. Serialisation applies two layers in
  order - the element's own formatting, then array-literal quoting, then the sink's row escaping
  - which is what a null element (`NULL`), an element spelling `NULL` (quoted), an empty string
  (`""`), and an empty array (`{}`, never `\N`) each depend on. A rule must produce a JavaScript
  array or null; a ragged nested array raises `RaggedArrayError` naming the column.

- **pgvector columns are supported**, as `ColumnKind.Vector` carrying the declared dimension.
  The value is a `number[]` everywhere, matching drizzle, and the serialisers write pgvector's
  `[1,2,3]` literal, which is deliberately not the `{1,2,3}` a PostgreSQL array uses. A vector's
  dimension is exact rather than a maximum, so `structuralDefault` fills a NOT NULL vector and
  leaves a nullable one null on every row, unlike every other nullable kind: filling one is
  always written down, with `randomVector(n)` or `optional(randomVector(n), rate)`. The new
  `randomVector` generator emits unit vectors from the run's seed. A rule producing the wrong
  number of components raises `VectorDimensionMismatchError` naming the column, instead of
  reaching the database; a NOT NULL vector declaring no dimension raises
  `UndeclaredVectorDimensionError`.

- **Table-level annotations**, as symbol keys on a rules object. `{ [structuralDefaults]: true }`
  names the columns worth naming and takes the derived default for the rest, so a large schema no
  longer has to choose between writing one entry per column and abandoning type-level drift
  detection wholesale: LobeChat needs 54 rules that are an actual decision out of 2228 columns.
  A rules object without the annotation must still name every column, so strictness is given up
  only by the table that asks, one visible line at a time. Symbol keys cannot collide with a
  column, since column keys are strings, and are skipped by `Object.keys` and `JSON.stringify`,
  so anything walking a rules object for columns still sees only columns. A table annotated
  `{ [unseeded]: true }` generates nothing and must declare nothing else, which
  `UnseededTableRuledError` enforces, since column rules that can never run and a second
  annotation that disagrees are both contradictions rather than preferences.

- **CHECK constraints are recorded in the canonical model**, as a name, the columns they mention
  and the predicate as drizzle recorded it, and `structuralDefault` on a column any check mentions
  now raises `CheckConstrainedColumnRuleRequiredError`, naming the constraint and quoting the
  predicate. The predicate itself is opaque dialect SQL and nothing tries to interpret it. The
  refusal earns its keep because a violated check aborts the whole COPY: measured on LobeChat's 24
  checks, structural defaults left 8 of the 12 check-carrying tables with no rows at all, so the
  alternative to refusing is a load that silently drops tables or dies with a database error
  several steps from the column that caused it.

### Fixed

- **Every generated PostgreSQL file now sets `\set ON_ERROR_STOP on` itself**, rather than relying
  on the `load.psql` orchestrator to set it once. psql's default is to report a failed statement,
  run the rest of the script and exit 0, so a COPY that violated a constraint lost its whole table
  while the load still reported success to the shell: visible to a human watching the terminal,
  invisible to any CI step or `RUN` line that checks the exit code. Measured against PostgreSQL 18,
  the same script now exits 3 and stops. The stream sink writes the guard once at the head, since
  it is a single script. The files already carried psql's own copy-from-stdin markers, so this
  costs no portability. MariaDB needs no equivalent: its client stops and exits non-zero already.

- **The fetched-schema examples typecheck from a clean checkout.** `upstream/` is gitignored, so
  on a fresh clone `examples:typecheck` ran before anything had fetched the schema and failed with
  `TS2307: Cannot find module '../upstream/schema.ts'`. Both packages now fetch as a `pretypecheck`
  step, and the fetch returns immediately when the pinned commit is already on disk, so running it
  before every typecheck and test costs nothing.

- **A boolean rule on a `customType` column is written as `1` or `0` for PostgreSQL**, not `t` or
  `f`. A custom column's wrapped SQL type is an arbitrary dialect string, so the serialiser cannot
  tell a boolean column from a numeric one, and the two spellings are not equally safe: measured,
  a boolean column accepts `1` and `0` as readily as `t` and `f`, while `smallint` rejects `t`
  outright with `invalid input syntax`. The numeric spelling is the one that cannot be wrong, and
  it is what the MariaDB and CSV sinks already wrote. Columns of the real Boolean kind are
  unchanged, keeping COPY's idiomatic `t` and `f`, since their type is known.

- **A member of a table-level composite primary key is no longer modelled as nullable.** drizzle
  carries `notNull` per column, but `primaryKey({ columns: [...] })` makes its members mandatory
  without touching their declarations, so a schema that declares the key once and never repeats
  `.notNull()` was modelled as nullable, and `structuralDefault` could generate a null the
  database rejects on load. The adapter now reports such a column as `notNull` and as
  `isPrimaryKey`, so every reader of the canonical model agrees with the database. Found in the
  wild by the LobeChat validation, where seven columns across three tables were affected.

### Deprecated

- **Passing `unseeded` as a table's entire rules value.** Write `{ [unseeded]: true }` instead.
  The old spelling still compiles and still works, and warns once per table through Node's
  deprecation channel, but it is no longer documented: annotations are keys now, so a table can
  carry more than one and future annotations have somewhere to go.

### Changed

- **The examples are split into `examples/sinks` and `examples/real-world`**, separating our own
  holiday-park domain, one example per sink, from schemas somebody else wrote. The README
  compilation harness moves to a top-level `readme` package, since it was never an example.
- **Generated file names now carry a prefix**, `seed-` by default, configurable per file sink
  with `filePrefix`. A number alone could not keep generated data sorting after a project's
  migrations: comparing a five-digit name with a four-digit one reaches the separator against a
  digit and loses, so `10010_parks.sql` sorted before `2000_migration.sql`, and data loaded
  before the tail of the migration history that created its tables. A leading letter beats every
  digit in both C and en_US collations, which is what the PostgreSQL and MariaDB entrypoints
  use. Numbers restart at `0010` within the prefix: unlike migrations, which accumulate for the
  life of a project, a run's files are replaced wholesale each time, so the sequence holds one
  schema's tables rather than a history, and 998 slots is the ceiling. A prefix containing a
  path separator is refused with `InvalidFilePrefixError`.
- The Pagila and AdventureWorks READMEs are indexed by symptom rather than by feature, so a
  reader whose schema has the same quirk (non-compiling `drizzle-kit pull` output, a NOT NULL
  cycle, partitioned tables, composite foreign keys, shared-primary-key subtype chains, a
  catalogue of CHECK constraints) can find the workaround directly.

### Removed

- UnsupportedRelationshipError, which existed only to refuse composite foreign keys.

## [0.1.0] - 2026-08-26

The first release.

### Added

**Schema understanding**

- One drizzle schema module in, a canonical model out, for PostgreSQL, MariaDB/MySQL and
  SQLite; a module mixing dialects is refused naming the tables on each side.
- Columns as drizzle declares them: kinds, JavaScript representations, nullability, value
  ranges (MySQL YEAR included), lengths, precision and scale, enum values, timestamp
  precision, and the declared type name of a `customType` column.
- Constraints as the database will enforce them: composite primary keys, unique constraints
  with `NULLS NOT DISTINCT` honoured, and plain unique indexes, which is how introspected
  schemas usually declare uniqueness. Partial and expression indexes are deliberately
  ignored, since a conditional constraint is not a table-wide one.
- `GENERATED ALWAYS AS` computed columns leave the model entirely: no rule is expected and
  no sink writes them, since no insert form may ever supply one. Identity and serial columns
  are engine-numbered, including serials introspected as plain `nextval(...)` defaults,
  whose sequences the finalise script advances by recorded name.
- Tables need no primary key; the two features that need one, per-parent counts and deferred
  foreign keys, say so before any row is generated.

**Generation**

- Everything reproducible from one seed: a hand-rolled mulberry32 source, every relative
  date measured from an injected reference date, and the seed carried in every report,
  manifest and mid-run error.
- Foreign keys assigned from generated parent rows; per-parent counts with retained parent
  context; self-references; cyclic schemas resolved by a deferred second pass.
- Row counts, weighted, zipfian and normal distributions, readable random words, uniqueness
  with retries, and overrides that pin exact values on exact rows while everything else
  stays random. Generator factories refuse configuration that cannot describe a
  distribution, at authoring time, before any seed exists.
- Type-level drift detection: `TableRules` demands a correctly typed rule for every
  insertable column and `SchemaRules` an entry for every table, with `unseeded` as the
  one-line declaration for tables a run deliberately skips. The types are structural, so
  they survive every TypeScript module resolution.

**Sinks**

- An in-memory graph whose rows arrive pre-wired through the schema's `relations()`
  declarations, lazily and invisibly to JSON, deepEqual and snapshots.
- Row batches in dependency order for any drizzle connection, constraints left on.
- Bulk `COPY` files or a single streamed script for psql, loading into `UNLOGGED` tables by
  default (opt out with `TableLogging.LeaveLogged`), triggers disabled during load (opt out
  with `TriggerHandling.LeaveEnabled`), a finalise script for sequences and `ANALYZE`, a
  `load.psql` orchestrator and a manifest recording how to reproduce the run.
- Extended `INSERT` files for MariaDB and MySQL, and RFC 4180 CSV files for everything else,
  cyclic schemas resolved to final values in both.
- File numbering that sorts after any drizzle-kit migration sharing the directory, with room
  for 8,998 files.

**Correctness and documentation**

- 28 structured errors, each naming the table, column or constraint concerned and what to do
  about it, every one listed in the README and kept there by a test.
- Serialisation proved against real servers: COPY text and CSV through PostgreSQL, literals
  through MariaDB, awkward values compared back as hex.
- A documented introspection workflow, validated end to end against Pagila, whose worked
  example ships in the repository alongside six other runnable example packages.

[0.1.0]: https://github.com/cressie176/drizzle-super-seed/releases/tag/v0.1.0
