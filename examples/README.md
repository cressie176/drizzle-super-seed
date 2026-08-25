# Examples

Each directory is a self-contained demonstration of one way to use drizzle-super-seed. They share
the same holiday-park domain and the same faker-driven generators, deliberately duplicated so that
every example reads on its own — pick the one matching your use case and copy it.

| Example | Shows |
|---|---|
| [`in-memory`](in-memory) | A complete, navigable dataset for unit tests — no database at all |
| [`batch-insert`](batch-insert) | Ordered row batches through your own drizzle `db.insert`, constraints enforced |
| [`postgres`](postgres) | Bulk `COPY` files baked into a PostgreSQL Docker image |
| [`mariadb`](mariadb) | Bulk extended-`INSERT` files for MariaDB or MySQL |
| [`sqlite`](sqlite) | A file-backed `.db` built through the row batch sink |

One schema module cannot serve several dialects — `pgTable`, `mysqlTable` and `sqliteTable` are
different constructors, and drizzle-super-seed rejects a mixed module — so each example declares
the domain for its own dialect. Wherever an example needs a database, its structure is created
from the drizzle schema by `drizzle-kit generate`; there is no hand-written DDL.

[`readme`](readme) is not an example: it hosts the compilation of every code block in the
project README, run by the root test suite.
