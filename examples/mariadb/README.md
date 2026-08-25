# MariaDB files example

The same park domain as the PostgreSQL example, generated as mysqldump-style extended-`INSERT`
files for MariaDB or MySQL — numbered table files, a finalise file, a `load.mysql` orchestrator
and a manifest. DDL comes from `drizzle-kit generate`.

Consume the files with the `mariadb`/`mysql` client, the MariaDB Docker image's
`/docker-entrypoint-initdb.d`, or any driver: the test loads them through `mysql2` with foreign
key checks on. Needs the repository's MariaDB (`npm run db:up` at the root).

```sh
npm run generate
npm test
```
