# MariaDB files example

The same park domain as the PostgreSQL example, generated as mysqldump-style extended-`INSERT`
files for MariaDB or MySQL: numbered table files, a finalise file, a `load.mysql` orchestrator
and a manifest. DDL comes from `drizzle-kit generate` and is written into `out/0000_schema.sql`
with the breakpoint comments stripped, so `out/` is self-contained and loads in file order.

Two ways to consume it, each with a test:

```sh
npm run generate
npm test          # loads out/ through mysql2 against the compose MariaDB (npm run db:up at the root)
npm run test:image  # bakes out/ into a MariaDB image and asserts the container starts loaded
```

The image is the same two lines as the PostgreSQL example's:

```dockerfile
FROM mariadb:11
COPY out/*.sql /docker-entrypoint-initdb.d/
```

`docker-entrypoint-initdb.d` runs `.sql` files in name order on first start, which is exactly the
sink's numbering; `manifest.json` and `load.mysql` are not `.sql` and are ignored. Build and run it
yourself with `npm run image:build` and `npm run image:run`.
