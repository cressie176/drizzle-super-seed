# Examples

Each directory is a self-contained package you can read, or copy, on its own. Pick the one
matching what you are trying to do.

`sinks/` is our own domain, one example per sink, and is where to start if the question is how to
use the library. `real-world/` is somebody else's schema, and is where to look if the question is
whether anyone has hit the quirk you have.

## sinks: one per sink, on the same holiday-park domain

These share a domain and faker-driven generators, deliberately duplicated so each reads alone.

| Example | Shows |
|---|---|
| [in-memory](sinks/in-memory) | A complete, navigable dataset for unit tests, no database at all |
| [batch-insert](sinks/batch-insert) | Ordered row batches through your own drizzle db.insert, constraints enforced |
| [postgres](sinks/postgres) | Bulk COPY files baked into a PostgreSQL image, loaded at first run or at build time |
| [postgres-stream](sinks/postgres-stream) | One psql script streamed into a spawned psql, no files in between |
| [mariadb](sinks/mariadb) | Bulk extended-INSERT files for MariaDB or MySQL, loaded through a driver or an image |
| [sqlite](sinks/sqlite) | A file-backed .db built through the row batch sink |
| [csv](sinks/csv) | Reviewable RFC 4180 files for spreadsheets and ETL, no database |

One schema module cannot serve several dialects, since pgTable, mysqlTable and sqliteTable are
different constructors and a mixed module is rejected, so each example declares the domain for
its own dialect. Wherever an example needs a database, its structure comes from the drizzle
schema by drizzle-kit generate; there is no hand-written DDL.

## real-world: schemas we did not write

### Introspected from a database

These start from a database rather than a schema module, and exist to be cribbed from: both
READMEs are indexed by symptom, so you can find the quirk your own schema has and read the
workaround.

| Example | Shows |
|---|---|
| [pagila](real-world/pagila) | The drizzle-kit pull workflow end to end: non-compiling output, a NOT NULL cycle, partitions, a trigger-filled tsvector |
| [adventureworks](real-world/adventureworks) | The same at scale: 68 tables, five schemas, 90 checks, composite foreign keys, subtype chains |

### Drizzle-native, written by hand

These start from a schema module somebody else wrote, rather than from a database. Both are fetched
from a pinned upstream commit rather than vendored, because neither repository's licence lets this
one redistribute their sources, and both reach the network and Docker Hub when they run.

| Example | Shows |
|---|---|
| [lobechat](real-world/lobechat) | 165 PostgreSQL tables: arrays, vectors, composite foreign keys, 24 CHECK constraints, and a foreign key narrower than the column it references |
| [bangumi](real-world/bangumi) | 61 MySQL tables with almost no declared constraints and 65 customType columns, plus the DDL repairs drizzle-kit's output needs |

The compilation harness for the project README's code blocks used to live here; it is now the
top-level `readme` package, since it was never an example.
