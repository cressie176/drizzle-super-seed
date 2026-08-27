# AdventureWorks example

AdventureWorks (the
[lorint/AdventureWorks-for-Postgres](https://github.com/lorint/AdventureWorks-for-Postgres)
port) introspected across its five schemas, repaired, seeded with ~42,000 rows, and baked into
a Postgres image:

```sh
npm run image:build   # fetch the DDL, generate, bake a postgres:18-alpine image
npm run image:run     # AdventureWorks on localhost:55434, user postgres, password aw
npm run test:image    # build the image and audit the running container
```

This is the example to crib from when your database is the big, old, constraint-heavy kind:
68 tables, five schemas, 90 foreign keys, 90 CHECK constraints. Find your quirk below.

**Your tables live in multiple schemas.** Pull with a `schemaFilter` listing them; tables
render through `pgSchema('sales').table(...)` and the library carries the schema name through
every sink, the UNLOGGED file included.

**Your schema uses SQL Server-style domains, `money`, `xml` or `bytea`.** 136 columns pulled
as non-compiling `unknown(...)` here. All mechanical: the six domains and `money` became their
underlying `varchar`, `boolean` and `numeric` types (114 columns, by script), and the 22
nullable `xml`/`bytea` columns were deleted, because omitted columns are never inserted. The
header of [src/schema.ts](src/schema.ts) records every repair.

**You have a composite foreign key.** `salesorderdetail`'s `(specialofferid, productid)` must
match a row of `specialofferproduct` together. The library records the relationship, orders
the load and the UNLOGGED file by it, and refuses `structuralDefault` on the member columns
with `CompositeForeignKeyRuleRequiredError`, because tuple members cannot be picked
independently. The workaround is in [src/rules.ts](src/rules.ts): both sides derive from one
agreed pair set, so every generated pair exists. That contract is why all 68 tables here load
`UNLOGGED` on the default settings.

**Your schema is covered in CHECK constraints.** All 90 are live during a `COPY` load; nothing
disables them, so the rules must satisfy every one. The patterns in
[src/rules.ts](src/rules.ts), by constraint shape: letter enums (`gender`, `maritalstatus`,
`productline`) use `pickFrom`; bounded numbers (`vacationhours`, `rating`, statuses) use
`randomInteger` and `randomDecimalString` with the CHECK's own bounds; cross-column date rules
(`duedate >= orderdate`, `enddate >= startdate`) use `derive` reading the row's earlier
column; and coupled conditions (`billofmaterials`' level, assembly and quantity moving
together) pin the whole group with `constant`.

**You want data that reads like your domain, not word soup.** The library derives values from
declared structure only, and deliberately never guesses from column names, so realistic data is
the rules file's job. [src/rules.ts](src/rules.ts) shows the two patterns worth copying.
Reference tables (countries, currencies, units of measure, departments, shifts, product
categories, locations, ship methods, sales territories, special offers) carry their real
contents as lists indexed by row number, which is deterministic and keeps keys unique, and
their counts are bound to the list lengths so a key can never repeat. Entity tables compose:
a product is named for its model, colour and size the way AdventureWorks names one
("Mountain-100 Black, 42"), a state carries the country it actually belongs to, and a
subcategory names its own parent so mountain bikes sit under bikes.

**Your schema has shared-primary-key subtype chains.** `businessentity -> person -> employee
-> salesperson` all share one key space, with vendors and stores carved from the same range.
Random parent picks fight primary key uniqueness on 1:1 chains, so the pattern is row numbers
with offsets: persons are ids 1 to 1000, vendors 1001 to 1300, stores 1301 to 1500, and every
subtype rule derives its id from its row index. See the constants at the top of
[src/rules.ts](src/rules.ts).

**Your DDL renames a column after creating it.** `install.sql` creates `doc` and later renames
it to `documentnode`. Write rules against the pulled module, not the DDL text: the module
reflects the database as it is, and an override keyed to the old name silently misses.

**You loaded with constraint checks disabled and want to trust the result.** Crib the audit in
[test/image.test.ts](test/image.test.ts): a catalogue-driven orphan scan, built from
`pg_constraint` inside the database, re-verifies every foreign key without a hand-maintained
list. It caught three real rule bugs while this example was being built; it will catch yours.

The DDL is fetched at generate time, pinned to an upstream commit, because the upstream
repository declares no licence; `sql/` stays gitignored for the same reason.
