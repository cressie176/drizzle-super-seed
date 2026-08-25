# PostgreSQL files example

Production-shaped data as bulk `COPY` files, baked into a Docker image by a two-line Dockerfile.
The schema is the single source of truth: `drizzle-kit generate` emits the DDL, and
`createPostgresSqlFileSink` emits numbered data files, a `load.psql` orchestrator and a manifest
recording the seed.

```sh
npm run generate     # DDL + data files
npm run image:build  # bake them into a postgres:18 image
npm run image:run    # a database with ~27,000 rows, ready on start
```

`npm run test:image` does all three and audits the running container.
