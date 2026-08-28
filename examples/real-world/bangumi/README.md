# Bangumi: a drizzle-native MySQL schema

[Bangumi](https://github.com/bangumi/server-private) is a Chinese media cataloguing site. Its
`drizzle/schema.ts` is 61 MySQL tables and 548 columns, written by hand against a database that
already existed, which makes it a useful opposite to the Pagila and AdventureWorks examples: those
were produced by `drizzle-kit pull` from a well-constrained schema, this one was written to query a
legacy database and declares almost nothing.

This example is the MariaDB dialect validation from issue #43, kept as runnable code.

## The schema is fetched, not vendored

The upstream repository carries no licence, so its schema is not ours to redistribute, and neither
is anything derived from it. `npm run fetch` downloads the module from a pinned commit into
`upstream/`, and `upstream/`, `drizzle/` and `out/` are all gitignored. What is committed here is
only this example's own code.

## Running it

The compose MariaDB from the repository root must be up.

```sh
npm run db:up          # from the repository root
npm install
npm run fetch          # download the pinned upstream schema
npm run generate       # DDL plus extended-INSERT files into out/
npm test               # generate, load into MariaDB, verify
```

## What this example shows

**Almost no constraints, and the library still works.** Zero foreign keys, zero unique constraints,
zero `relations()`, and only 3 of the 61 tables declare a primary key. The relationships are real
but live in application code. drizzle-super-seed used to require more than this; the relaxation that
allows it is what makes this schema seedable at all.

**Rules are 65 decisions, not 548 entries.** Each table carries `{ [structuralDefaults]: true }`,
so only the customType columns are named.

**customType columns need a rule each, and cannot be guessed.** 65 columns here wrap ordinary SQL
types through `customType`: 22 varchar, 20 mediumtext, 17 tinyint, 4 text, 2 mediumblob. Because
`customType` hides the JavaScript representation from drizzle's runtime, `structuralDefault` has
nothing to derive from and the library refuses to invent one. The canonical schema does expose the
wrapped SQL type, so `src/rules.ts` dispatches on that.

Sinks never call a `customType`'s `toDriver`. They encode a custom value by its JavaScript type,
each in its own conventions, so a boolean reaches MariaDB as 1 and PostgreSQL as `t`, and a rule can
return the natural value without knowing which sink it will meet. The tinyint columns here use 0 and
1 because that is what the column stores and it reads plainly, not because a boolean would fail.

**The typed and dynamic rule paths, and what you give up.** Every one of the 548 columns needs a
rule, because a missing one is a `MissingColumnRuleError` by design: adding a column to a schema
should never silently start producing data for it. Writing 548 by hand is not sensible, so this
example builds the rules object from the canonical schema in a loop. The cost is real and the
compiler makes it visible: given the true module type, `SchemaRules` names all 61 tables and rejects
a loop-built object, so `scripts/generate.ts` has to widen the schema to `Record<string, unknown>`
first. Prefer the typed path for a schema you own; reach for this one when the schema is somebody
else's.

**drizzle-kit's own DDL does not load.** `src/ddl-repairs.ts` fixes two things before the DDL reaches
MariaDB, neither of them a drizzle-super-seed problem, both worth knowing if you point drizzle-kit
at a schema written for querying:

| Error | Cause | Repair |
| --- | --- | --- |
| 1075, auto column must be a key | AUTO_INCREMENT emitted with no primary key, because the module declares none | add PRIMARY KEY to the auto column, but only where the table declares no key of its own |
| 1064, syntax error at varchar NOT NULL | the htmlEscapedString customType returns a bare "varchar" from dataType(), with no length | give it an explicit length |

## What it does not show

Escaping. The generated values are plain words, so nothing here exercises quote or backslash
handling; that is covered against a real server by the library's own integration tests. Row volumes
are deliberately tiny at 3 per table, so the extended-INSERT batching is not stretched either. Raise
`ROWS_PER_TABLE` in `src/counts.ts` to lean on it.
