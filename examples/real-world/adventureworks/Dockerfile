# AdventureWorks with ~42,000 generated rows across 68 tables and five schemas, ready on first
# start. The DDL keeps a digit prefix, so it sorts before every seed- prefixed data file.
FROM postgres:18-alpine
COPY sql/adventureworks-schema.sql /docker-entrypoint-initdb.d/0000_adventureworks_schema.sql
COPY out/*.sql /docker-entrypoint-initdb.d/
