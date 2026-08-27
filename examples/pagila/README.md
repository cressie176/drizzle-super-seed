# Pagila example

[Pagila](https://github.com/devrimgunduz/pagila) (the classic PostgreSQL DVD-rental sample)
introspected with `drizzle-kit pull`, repaired, seeded with ~25,000 rows of column-aware data,
and baked into a Postgres image:

```sh
npm run image:build   # generate the data and bake DDL + rows into a postgres:18-alpine image
npm run image:run     # a populated Pagila on localhost:55433, user postgres, password pagila
npm run test:image    # build both images (first-run-loaded and prebaked) and audit them
```

The real value of this example is that Pagila has the quirks your database probably has. Find
yours below; each entry says what goes wrong, what this example does about it, and where to
read the workaround.

**Your `drizzle-kit pull` output does not compile.** Exotic types render as
`unknown("column")` with a TODO comment, and `unknown` is not an import that exists. Here that
was a `year` domain, a `tsvector` and a `bytea`. The three repairs, recorded in the header of
[src/schema.ts](src/schema.ts): a domain becomes its underlying type (`year` became `integer`,
with the rules respecting its CHECK range), a type you want generated becomes a `customType`
with a rule supplying its text form (`fulltext`), and a nullable exotic is simply deleted,
because omitted columns are never inserted (`picture`, `special_features`).

**A trigger normally fills one of your columns, and bulk loads skip triggers.** Pagila's
`film.fulltext` is `tsvector NOT NULL`, maintained by a trigger the load never fires. The rule
in [src/rules.ts](src/rules.ts) supplies the text form directly, and the image test proves the
result answers a real `to_tsquery`.

**Your schema has a cycle, and both directions are NOT NULL.** `store.manager_staff_id` and
`staff.store_id` point at each other, neither nullable. Two things happen: `drizzle-kit pull`
silently drops one edge (TypeScript declaration order cannot express the cycle), and had it
kept the edge, a NOT NULL cycle is refused by design, because no placeholder can enter a NOT
NULL column. The workaround is the one Pagila's own dump uses: the rule points
`managerStaffId` at staff row numbers that will exist, and the load runs with constraint
checks disabled, ending consistent.

**Your table is partitioned.** `drizzle-kit pull` renders the 56 monthly payment partitions as
sibling tables and the parent not at all. This example trims the partitions from the module
and seeds one (`payment_p2022_01`) with a rule that respects its date bounds; the image test
shows the 6,000 rows arriving through the partitioned parent.

**You trimmed tables from the module, and the UNLOGGED load fails with 42P16.** The trimmed
partitions still exist in the database and reference `rental`, so the default
`seed-00000_set_unlogged.sql` file hits `could not change table ... to unlogged`. The generate script
opts out with `TableLogging.LeaveLogged`, with the reason at the call site in
[scripts/generate.ts](scripts/generate.ts).

**Your serials were introspected as `default(nextval(...))`.** The library handles this: the
column is recognised as sequence-owned and the finalise file advances the sequence by name, so
the insert after seeding does not collide. The image test asserts it (`language_id` comes back
as 7, not 1). Your uniqueness lives in unique **indexes** rather than constraints? Also
handled; the engine tracks them.

**A `GENERATED ALWAYS AS` column.** `film.length_hours` is computed by PostgreSQL. The library
excludes such columns from the model entirely: no rule is expected, no value is written, and
the image test verifies postgres computed all 1,000 values itself.

Pagila is by Devrim Gunduz and contributors, PostgreSQL licence. The shipped DDL trims only
pagila's pgvector demo table, with the reason in [sql/pagila-schema.sql](sql/pagila-schema.sql).
