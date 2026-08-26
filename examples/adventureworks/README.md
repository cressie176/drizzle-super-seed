# AdventureWorks example

drizzle-super-seed against AdventureWorks (the
[lorint/AdventureWorks-for-Postgres](https://github.com/lorint/AdventureWorks-for-Postgres)
port): 68 tables across five schemas, 90 foreign keys, 90 CHECK constraints, and the
introspection workflow from the root README at its production scale. Everything lands in a
Postgres image, so running it locally is one docker command.

```sh
npm run image:build  # fetch the DDL, generate ~42,000 rows, bake a postgres:18-alpine image
npm run image:run    # AdventureWorks on localhost:55434, user postgres, password aw
```

`npm run test:image` does all of that and audits the running container. The audits are the
point of the example:

- The 90 CHECK constraints were live during the load - `COPY` never bypasses them - so a clean
  start already proves every gender, status, date-ordering and positive-quantity rule the
  schema declares. A sample is asserted visibly anyway.
- Every one of the 90 foreign keys is re-verified by a catalogue-driven orphan scan built
  inside the database, not by a hand-maintained list.
- The subtype chains hold exactly: person ids are a prefix of businessentity ids, employees of
  persons, salespeople of employees, with vendors and stores carved from disjoint ranges of
  the same shared key space - the row-number-with-offsets pattern in
  [src/rules.ts](src/rules.ts).

Two departures worth reading about in the source:

- The schema module's header records every repair the pull needed: 114 domain and money
  columns, 22 deleted xml/bytea columns, and the one composite foreign key the module cannot
  declare - which is also why generation opts out of the UNLOGGED default (the database still
  enforces the edge, so the ordering computed from the module cannot see it).
- The DDL is fetched at generate time, pinned to an upstream commit, rather than shipped: the
  upstream repository declares no licence, so `sql/` stays out of this one.
