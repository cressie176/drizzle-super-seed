# AdventureWorks with ~42,000 generated rows across 68 tables and five schemas, ready on first
# start. The DDL is renamed on copy so it sorts before the 10010_-numbered data files.
FROM postgres:18-alpine
COPY sql/adventureworks-schema.sql /docker-entrypoint-initdb.d/0000_adventureworks_schema.sql
COPY out/*.sql /docker-entrypoint-initdb.d/
