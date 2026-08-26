# Pagila example

drizzle-super-seed against [Pagila](https://github.com/devrimgunduz/pagila), the classic
PostgreSQL sample schema - not a schema written for this library, but a real one introspected
with `drizzle-kit pull` and repaired by hand. It is the worked example of the root README's
"Seeding an existing database" section: every trap that section documents was hit here, and the
header of [src/schema.ts](src/schema.ts) records each repair (the `year` domain, a `tsvector`
through `customType`, deleted binary and array columns, 56 payment partitions collapsed to one,
and the cyclic foreign key `drizzle-kit pull` silently dropped).

Values are column-aware: `first_name` gets a first name, `address` a street address, emails
derive from the row's own generated name, and film titles are titles - the faker pattern from
the root README, one seed shared by both libraries.

```sh
npm run generate   # ~25,000 rows as psql COPY files in out/
npm test           # loads the real Pagila DDL into the compose PostgreSQL, loads out/ after it,
                   # and audits the result (npm run db:up at the repository root first)
```

What the test proves, each the reason Pagila earned its place:

- Every foreign key joins, including `store.manager_staff_id`, whose constraint the pull dropped.
- The 6,000 partition-targeted payments show through the partitioned `payment` parent.
- The `tsvector` column answers a real `to_tsquery`, and PostgreSQL computed the
  `GENERATED ALWAYS AS` column itself.
- The pulled serials advanced their sequences, so the insert after seeding does not collide.

The generation opts out of the UNLOGGED default (`TableLogging.LeaveLogged`), deliberately: the
database keeps 55 partitions this module trimmed away, and one of them referencing `rental`
would fail `10000_set_unlogged.sql` with the documented 42P16 - the trimmed-module trap, live.
