# Changelog

All notable changes to drizzle-super-seed are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Composite foreign keys are recorded in the canonical model rather than refused: they order
  the load and the UNLOGGED file, relations() navigation over them works, and a dependency
  cycle whose only candidates are composite edges is refused, since a tuple cannot be
  half-patched by the deferred pass. structuralDefault on a member column raises
  CompositeForeignKeyRuleRequiredError naming the tuple and the remedy: write rules that keep
  it valid together, as the AdventureWorks example demonstrates.

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
