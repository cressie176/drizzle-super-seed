# Examples

Each directory is a self-contained package you can read, or copy, on its own. Pick the one
matching what you are trying to do.

## One per sink, on the same holiday-park domain

These share a domain and faker-driven generators, deliberately duplicated so each reads alone.

| Example | Shows |
|---|---|
| [in-memory](in-memory) | A complete, navigable dataset for unit tests, no database at all |
| [batch-insert](batch-insert) | Ordered row batches through your own drizzle db.insert, constraints enforced |
| [postgres](postgres) | Bulk COPY files baked into a PostgreSQL image, loaded at first run or at build time |
| [postgres-stream](postgres-stream) | One psql script streamed into a spawned psql, no files in between |
| [mariadb](mariadb) | Bulk extended-INSERT files for MariaDB or MySQL, loaded through a driver or an image |
| [sqlite](sqlite) | A file-backed .db built through the row batch sink |
| [csv](csv) | Reviewable RFC 4180 files for spreadsheets and ETL, no database |

One schema module cannot serve several dialects, since pgTable, mysqlTable and sqliteTable are
different constructors and a mixed module is rejected, so each example declares the domain for
its own dialect. Wherever an example needs a database, its structure comes from the drizzle
schema by drizzle-kit generate; there is no hand-written DDL.

## Real schemas, introspected

These start from a database rather than a schema module, and exist to be cribbed from: both
READMEs are indexed by symptom, so you can find the quirk your own schema has and read the
workaround.

| Example | Shows |
|---|---|
| [pagila](pagila) | The drizzle-kit pull workflow end to end: non-compiling output, a NOT NULL cycle, partitions, a trigger-filled tsvector |
| [adventureworks](adventureworks) | The same at scale: 68 tables, five schemas, 90 checks, composite foreign keys, subtype chains |

## Real schemas, drizzle-native

These start from a schema module somebody else wrote by hand, rather than from a database. Both
are fetched from a pinned upstream commit rather than vendored, because neither repository's
licence lets this one redistribute their sources.

| Example | Shows |
|---|---|
| [lobechat](lobechat) | 165 PostgreSQL tables: arrays, vectors, composite foreign keys, 24 CHECK constraints, and a foreign key narrower than the column it references |
| [bangumi](bangumi) | 61 MySQL tables with almost no declared constraints and 65 customType columns, plus the DDL repairs drizzle-kit's output needs |

## Not an example

[readme](readme) hosts the compilation of every code block in the project README, run by the
root test suite.
