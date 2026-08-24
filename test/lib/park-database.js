const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Client } = require('pg');
const { getTableConfig } = require('drizzle-orm/pg-core');
const { lettingStatus, ...parkTables } = require('./park-schema');

const ddl = readFileSync(join(__dirname, 'park-schema.sql'), 'utf8');

const tableNames = Object.values(parkTables).map((table) => getTableConfig(table).name);

const connect = async () => {
  const client = new Client({
    host: process.env.PGHOST ?? 'localhost',
    port: process.env.PGPORT ?? 5432,
    user: process.env.PGUSER ?? 'drizzle_super_seed',
    password: process.env.PGPASSWORD ?? 'drizzle_super_seed',
    database: process.env.PGDATABASE ?? 'drizzle_super_seed',
  });
  await client.connect();
  return client;
};

const createParkSchema = (client) => client.query(ddl);

const dropParkSchema = async (client) => {
  await client.query(`DROP TABLE IF EXISTS ${tableNames.join(', ')} CASCADE`);
  await client.query(`DROP TYPE IF EXISTS ${lettingStatus.enumName}`);
};

module.exports = { connect, createParkSchema, dropParkSchema };
