FROM postgres:18
COPY src/schema.sql /docker-entrypoint-initdb.d/000_schema.sql
COPY docker/initdb/ /docker-entrypoint-initdb.d/
