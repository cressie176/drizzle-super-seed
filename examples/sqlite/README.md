# SQLite example

There is deliberately no SQLite file sink: the database is embedded, so there are no network round
trips for a bulk format to avoid, and a single transaction of inserts through the row batch sink
is already the fast path. This example builds a complete file-backed `fixtures/park.db` — DDL from
`drizzle-kit generate`, data through `createRowBatchSink` — ready to commit or hand to tests.

```sh
npm run generate
npm test
```
