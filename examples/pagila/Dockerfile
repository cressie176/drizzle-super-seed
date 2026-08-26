# Pagila with ~25,000 generated rows, ready on first start. The DDL is renamed on copy so it
# sorts before the 10000_-numbered data files; the manifest and load.psql are not .sql and are
# ignored by the entrypoint. Run as the default postgres superuser: the Pagila dump's OWNER TO
# postgres statements need the role to exist.
FROM postgres:18-alpine
COPY sql/pagila-schema.sql /docker-entrypoint-initdb.d/0000_pagila_schema.sql
COPY out/*.sql /docker-entrypoint-initdb.d/
