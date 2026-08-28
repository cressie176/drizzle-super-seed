# LobeChat: a large drizzle-native PostgreSQL schema

[LobeChat](https://github.com/lobehub/lobe-chat) is an AI chat application. Its schema is 165
tables and 2228 columns across 55 modules, written by hand by drizzle users rather than produced by
`drizzle-kit pull`, which is why it was chosen: it is the largest realistic test of what a modern
application schema actually asks of a seeder.

This example is the PostgreSQL validation from issue #44, kept as runnable code.

## The schema is fetched, not vendored

LobeChat is under a custom licence, so its sources are not ours to redistribute. `npm run fetch`
downloads a pinned commit into `upstream/`, which is gitignored along with `drizzle/` and `out/`.
What is committed here is only this example's own code, including the small stubs under
`src/stubs/` that stand in for LobeChat's unpublished internal packages.

## Running it

Docker must be available. Unlike the other PostgreSQL examples this one does not use the compose
database, because the schema has vector columns and the compose image has no pgvector; the test
runs a `pgvector/pgvector` container of its own, exactly as the library's own vector test does.

```sh
npm install
npm run fetch          # download the pinned upstream schema
npm run generate       # COPY files into out/
npm test               # generate, load into pgvector, verify
```

## What this example shows

**Arrays and vectors, in the wild.** When this schema was first surveyed it could not be seeded at
all: 17 array columns and 11 vector columns were unsupported, and because the documented workaround
was to drop the offending table, one nullable `varchar(64)[]` on `users` cascaded until 158 of the
165 tables had to go. Both types are supported now, and all 165 tables generate and load. Nothing
in `src/rules.ts` mentions either one; they take the structural default like everything else.

**Rules are 54 decisions, not 2228 entries.** Each table carries `{ [structuralDefaults]: true }`,
which says once that anything it does not name takes the derived default. Only the columns below
are named, and each is named for a reason the schema forced.

**Composite foreign keys need rules that keep the tuple together.** Five of them span three tables.
A member cannot take a structural default, because choosing each column independently produces a
tuple that does not exist in the parent, and the library refuses rather than emit a broken row.
`src/composite-keys.ts` shows the technique: fix the shared key values up front and have parent and
child draw from the same pools, so every child tuple exists in the parent by construction.

**CHECK constraints, and why the library refuses rather than guesses.** LobeChat declares 24 of
them, and they are the reason this example needs most of its hand-written rules. drizzle's `check()`
is a constraint on the table and its predicate is opaque SQL, so nothing can tell whether generated
data would satisfy it. The measurement that settled the design was taken here: with the rules in
`src/check-constraints.ts` removed, 8 of the 12 check-carrying tables loaded **no rows at all**,
because a violated check aborts the whole COPY. Structural defaults do not produce slightly wrong
data on a checked schema, they produce missing tables.

So `structuralDefault` on a column a check mentions now raises
`CheckConstrainedColumnRuleRequiredError`, naming the constraint and quoting the predicate, which
usually tells you the rule to write. Foreign keys and sequence-owned columns are exempt: their
values come from a real parent row or from the engine, not from a guess.

`src/check-constraints.ts` works through every shape the 24 take:

| Constraint shape | Example | What the rule does |
| --- | --- | --- |
| bounded set | apns_environment IN ('sandbox', 'production') | pick from the set |
| regular expression | review_token_hash matches 64 hex characters | build a value to match |
| range | version greater than 0 | generate within the range |
| two columns related | item_index less than item_count | fix the pair together |
| all null or all set | the six custom execution columns | null the whole group |

The refusal is per column rather than per constraint, so a check you satisfy by nulling one column
still asks for a rule on the others it mentions. That is deliberate: it cannot know which column you
intend to satisfy it with. Three of the rules here exist only for that reason, and say so.

**A foreign key narrower than the column it references.** `documents.id` is `varchar(255)`, and
`document_chunks.document_id`, which references it, is `varchar(30)`. PostgreSQL permits that and
only objects when a value which fits the parent is copied into the narrower child, which happens as
soon as either table has rows in it. LobeChat never notices because its own generated ids are short.
This is the class of thing a seeder is good at surfacing: it generates what the parent's declared
type allows, and the database enforces what the schema actually requires. `src/narrow-references.ts`
generates the parent within the narrowest bound anything references it by.

**A bug this example found.** Three of the tables key themselves with `primaryKey({ columns: [...] })`
and never repeat `.notNull()` on the members, which is normal, since PostgreSQL makes a primary key
column NOT NULL regardless. The library modelled those seven columns as nullable and generated nulls
for them, and the load failed. That is issue #53, fixed; this example is the regression test that
would have caught it.

## What it does not show

Volume. Three rows per table keeps the test quick; raise `ROWS_PER_TABLE` in `src/counts.ts` to lean
on the COPY files properly. The schema also declares no `relations()` that reach this example's
entry point, so graph navigation is not exercised here.
