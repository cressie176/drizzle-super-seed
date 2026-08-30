# MusicBrainz (musicbrainz schema only) with ~8,000 generated rows across 372 tables, ready on
# first start. postgres:18, not alpine: CreateCollations.sql declares an ICU collation. The DDL
# lands outside /docker-entrypoint-initdb.d because the entrypoint would run loose .sql files
# itself, alphabetically and without the search_path; the init script runs them in InitDb.pl's
# order instead, and sorts before every seed- prefixed data file.
FROM postgres:18
COPY sql/*.sql /mb-ddl/
COPY scripts/create-schema.sh /docker-entrypoint-initdb.d/0000_musicbrainz_schema.sh
COPY out/*.sql /docker-entrypoint-initdb.d/
