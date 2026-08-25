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

## Two Dockerfiles

`Dockerfile` copies the files into `/docker-entrypoint-initdb.d/`, so the load replays on a
container's first start. Simple, but every fresh container pays the load time before it serves.

`Dockerfile.prebaked` runs the same load while the image builds, so a container starts serving in
about a second. The catch it exists to demonstrate: the `postgres` base image declares
`VOLUME /var/lib/postgresql/data`, and anything a `RUN` step writes under a declared volume path
is discarded when the layer commits, so a naive build-time load silently produces an empty
database. The Dockerfile moves `PGDATA` out from under the volume declaration first, then drives
the official entrypoint's own init functions at build time. The data lives in the image layers:
bigger image, instant start, and the credentials are fixed at build time rather than by `-e` at
run time.

```sh
npm run image:build:prebaked
docker run --rm -e POSTGRES_PASSWORD=park -p 55432:5432 drizzle-super-seed-park-prebaked
```
