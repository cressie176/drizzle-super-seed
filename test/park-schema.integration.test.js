const { describe, it, before, after } = require('node:test');
const { deepEqual: deq } = require('node:assert');
const { getTableConfig } = require('drizzle-orm/pg-core');
const { connect, createParkSchema, dropParkSchema } = require('./lib/park-database');
const { lettingStatus, ...parkTables } = require('./lib/park-schema');

const postgresTypeNames = {
  serial: 'integer',
  smallserial: 'smallint',
  bigserial: 'bigint',
  timestamp: 'timestamp without time zone',
  time: 'time without time zone',
};

const postgresTypeName = (sqlType) => {
  const compact = sqlType.replace(/,\s+/g, ',');
  return postgresTypeNames[compact] ?? compact.replace(/^varchar\(/, 'character varying(');
};

const byTableThenColumn = (a, b) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`);

const declaredColumns = Object.values(parkTables)
  .flatMap((table) => {
    const config = getTableConfig(table);
    return config.columns.map((column) => ({
      table: config.name,
      column: column.name,
      type: postgresTypeName(column.getSQLType()),
    }));
  })
  .sort(byTableThenColumn);

const createdColumnsQuery = `
  SELECT c.relname AS table, a.attname AS column, format_type(a.atttypid, a.atttypmod) AS type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
`;

const enumValuesQuery = `
  SELECT e.enumlabel AS value
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = $1
  ORDER BY e.enumsortorder
`;

describe('park schema fixture', () => {
  let client;

  before(async () => {
    client = await connect();
    await dropParkSchema(client);
    await createParkSchema(client);
  });

  after(async () => {
    await dropParkSchema(client);
    await client.end();
  });

  it('creates every column the drizzle definitions declare, with the same type', async () => {
    const { rows } = await client.query(createdColumnsQuery);
    deq(rows.sort(byTableThenColumn), declaredColumns);
  });

  it('creates the letting status enum with the declared values', async () => {
    const { rows } = await client.query(enumValuesQuery, [lettingStatus.enumName]);
    deq(
      rows.map((row) => row.value),
      [...lettingStatus.enumValues],
    );
  });
});
