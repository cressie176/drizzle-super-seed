# Batch insert example

The generator hands ordered row batches to your own drizzle `db.insert` handler — you own the
connection, the transaction strategy and the error handling — with every foreign key constraint
enforced throughout the load.

The tables are created from the drizzle schema by `drizzle-kit generate`; there is no hand-written
DDL. Needs the repository's PostgreSQL (`npm run db:up` at the root).

```sh
npm test
```
