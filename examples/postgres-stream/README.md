# PostgreSQL stream example

The same park domain as the file sink example, streamed as one psql script straight into a
spawned `psql` process: no output directory, no intermediate files, and the script is never
held whole anywhere. That bounded footprint is the stream sink's reason to exist next to the
file sink, and it fits pipelines that want a load as a process rather than an artefact - piped
over a connection string, or through `gzip` into cold storage.

```sh
npm test   # streams a production-shaped load into the compose PostgreSQL and audits it
           # (npm run db:up at the repository root first)
```

The test is the README's spawn pattern made real: `psql` reads from stdin as the sink writes,
back-pressure flowing through the stream. Three things it proves:

- ~27,000 rows arrive intact, every foreign key joining, sequences ready for the next insert.
- The `prepare`-driven preamble made every table `UNLOGGED` before any data arrived - the
  block lands at the head of the stream, which only a schema-wide hook could place there.
- DDL comes from `drizzle-kit generate` against the schema module, like every example here:
  no hand-written SQL anywhere.
