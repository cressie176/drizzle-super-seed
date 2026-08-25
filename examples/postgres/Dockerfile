FROM postgres:18
COPY drizzle/*.sql /docker-entrypoint-initdb.d/
COPY docker/initdb/ /docker-entrypoint-initdb.d/
