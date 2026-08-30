#!/bin/bash
# Loads the fetched MusicBrainz DDL in InitDb.pl's order for a standalone database, musicbrainz
# schema only. The list mirrors DDL_FILES in scripts/generate.ts. Runs as the image's superuser
# against POSTGRES_DB, which the extensions and the search configuration require.
set -e
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -c 'CREATE SCHEMA musicbrainz'
export PGOPTIONS='-c search_path=musicbrainz,public'
for file in Extensions CreateCollations CreateTypes CreateTables CreatePrimaryKeys \
    CreateSearchConfiguration CreateFunctions CreateIndexes CreateFKConstraints CreateConstraints; do
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -f "/mb-ddl/$file.sql"
done
