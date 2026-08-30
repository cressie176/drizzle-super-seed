# MusicBrainz example

MusicBrainz ([metabrainz/musicbrainz-server](https://github.com/metabrainz/musicbrainz-server),
musicbrainz schema only) introspected, repaired, seeded with ~8,000 rows across all 372 tables,
and baked into a Postgres image:

```sh
npm run image:build   # fetch the DDL, generate, bake a postgres:18 image
npm run image:run     # MusicBrainz on localhost:55435, user postgres, password mb
npm run test:image    # build the image and audit the running container
```

This is the example to crib from when your database is the enormous, accumulated kind: 372
tables, 770 foreign keys, 663 CHECK constraints, 226 unique indexes, partitioned tables, an
ICU collation and a cube column. It began as the validation exercise in
[#41](https://github.com/cressie176/drizzle-super-seed/issues/41); the findings there are the
long form of everything below.

**Your pulled module does not even parse.** drizzle-kit rendered every `DEFAULT ''::text` as
the unterminated literal `.default(')` - 256 syntax errors. tsc reports all of them in one
pass, and one string replacement repairs them; the same one-pass principle is why the library
now collects every rule refusal into a single report (`GenerationPlanRefusalsError`) instead
of surfacing one per run. The header of [src/schema.ts](src/schema.ts) records this repair and
the three below.

**Your schema has partitioned tables.** The two partitioned parents are invisible to
drizzle-kit pull, along with their four foreign keys, and the pull also dropped `.array()`
from six of the partitions' columns - restored by hand, or the module lies about the type and
the failure is a malformed array literal at COPY time. The partitions themselves seed
directly, with rules pinning the `LIST (is_track_artist)` partition key to each partition's
bound, and the rows show through the parents after load.

**Your schema is covered in CHECK constraints, and writing 700 rules by hand is absurd.**
[scripts/build-rules.ts](scripts/build-rules.ts) generates [src/rules.ts](src/rules.ts) from
the canonical model instead: a `structuralDefaults` skeleton per table, with overrides
produced by classifying each check-constrained column's predicate. MusicBrainz's 663 checks
cluster into about a dozen shapes (`x >= n`, `controlled_for_whitespace`, end-date/ended
triples, alias search-hint clones, exactly-one-of pairs), so 161 of the 372 tables need
nothing beyond the skeleton and only the genuinely odd - ISWC/ISRC/IPI/ISNI formats, the
Various Artists row, the cube - are hand-mapped. Unclassifiable columns fail the build rather
than guess.

**Your checks constrain foreign keys against each other.** `non_loop_relationship`
(`entity0 <> entity1`) appears on fourteen relationship tables, and `tag_relation` orders a
pair of foreign keys. Random parent picks cannot satisfy either; the rules derive disjoint row
numbers instead, and the library refuses `structuralDefault` on such columns with
`CheckConstrainedForeignKeyRuleRequiredError` so the load is not the first to notice.

**Your checks pin special rows.** `artist_va_check` constrains whatever row serial id 1 lands
on, reaching through columns the engine numbers itself. The artist rules hold the affected
columns to values every branch of the predicate accepts; see the hand map in
[scripts/build-rules.ts](scripts/build-rules.ts).

**Your schema declares uniqueness on short text.** A `char(2)` primary key survives 20 random
rows but not 200: the retry budget exhausts with `UniqueConstraintExhaustedError`. Sequence
derived codes are unique by construction; the builder applies them to every single-column
unique index or text primary key, sized to the column.

**Your database enforces edges your module cannot see.** The pull-invisible `artist_release`
still references `release` inside the database, so the default UNLOGGED ordering fails with
the documented 42P16. This example generates with `TableLogging.LeaveLogged` and the reason at
the call site - the trimmed-module trap from the README, met here by its third distinct route.

**You loaded with constraint checks disabled and want to trust the result.** The audit in
[test/image.test.ts](test/image.test.ts) is catalogue-driven: built from `pg_constraint`
inside the database, it re-verifies all 770 foreign keys with no hand-maintained list. During
the original validation it caught the one orphan the load could not - a row-number rule
overrunning its pool by one - which is exactly the class of bug it exists to catch.

The DDL is fetched at generate time, pinned to commit `5d91d1f` (v-2026-07-30.1), because
musicbrainz-server is GPL-2.0-or-later and this repository is MIT; `sql/` stays gitignored for
the same reason. The introspected and repaired module in [src/schema.ts](src/schema.ts) is
committed, as machine-derived structure in the same spirit as the AdventureWorks example.
