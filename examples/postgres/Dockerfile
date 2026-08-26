FROM postgres:18-alpine
COPY drizzle/*.sql /docker-entrypoint-initdb.d/
COPY docker/initdb/ /docker-entrypoint-initdb.d/
