const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const mysql = require('mysql2/promise');

const ddl = readFileSync(join(__dirname, 'park-schema-mariadb.sql'), 'utf8');

const TABLE_NAMES = ['lettings', 'accessories', 'holiday_homes', 'pitches', 'park_owners', 'owners', 'parks'];

const connect = () =>
  mysql.createConnection({
    host: process.env.MARIADB_HOST ?? 'localhost',
    port: Number(process.env.MARIADB_PORT ?? 3306),
    user: process.env.MARIADB_USER ?? 'drizzle_super_seed',
    password: process.env.MARIADB_PASSWORD ?? 'drizzle_super_seed',
    database: process.env.MARIADB_DATABASE ?? 'drizzle_super_seed',
    multipleStatements: true,
  });

const createParkSchema = (connection) => connection.query(ddl);

const dropParkSchema = async (connection) => {
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  await connection.query(`DROP TABLE IF EXISTS ${TABLE_NAMES.join(', ')}`);
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');
};

module.exports = { TABLE_NAMES, connect, createParkSchema, dropParkSchema };
