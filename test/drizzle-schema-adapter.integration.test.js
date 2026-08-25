const { describe, it, before, after } = require('node:test');
const { deepEqual: deq } = require('node:assert');
const { asc, sql } = require('drizzle-orm');
const { drizzle } = require('drizzle-orm/node-postgres');
const { integer, pgTable, varchar } = require('drizzle-orm/pg-core');
const { IdentifierCasing, extractCanonicalSchema } = require('../lib');
const { connect } = require('./lib/park-database');

const casingProbe = pgTable('casing_probe', {
  pitchId: integer().notNull(),
  ownerName: varchar({ length: 20 }),
  explicitlyNamed: integer('explicit_name'),
});

const ddl = `CREATE TABLE casing_probe (
  pitch_id INTEGER NOT NULL,
  owner_name VARCHAR(20) NOT NULL,
  explicit_name INTEGER NOT NULL
)`;

const createdColumnsQuery = `
  SELECT a.attname AS name
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  WHERE c.relname = $1 AND a.attnum > 0 AND NOT a.attisdropped
  ORDER BY a.attnum
`;

const canonicalProbe = () =>
  extractCanonicalSchema({ casingProbe }, { casing: IdentifierCasing.SnakeCase }).tables.get('casingProbe');

const insertStatement = (table) => {
  const columns = table.columns.map((column) => column.name).join(', ');
  const placeholders = table.columns.map((column, index) => `$${index + 1}`).join(', ');
  return `INSERT INTO ${table.name} (${columns}) VALUES (${placeholders})`;
};

describe('drizzle schema adapter', () => {
  let client;
  let db;

  before(async () => {
    client = await connect();
    db = drizzle({ client, casing: 'snake_case' });
    await db.execute(sql.raw('DROP TABLE IF EXISTS casing_probe'));
    await db.execute(sql.raw(ddl));
  });

  after(async () => {
    await db.execute(sql.raw('DROP TABLE IF EXISTS casing_probe'));
    await client.end();
  });

  describe('identifier casing', () => {
    it('names columns as the database names them', async () => {
      const { rows } = await client.query(createdColumnsQuery, [canonicalProbe().name]);
      deq(
        canonicalProbe().columns.map((column) => column.name),
        rows.map((row) => row.name),
      );
    });

    it('names columns as a snake case drizzle instance names them', async () => {
      await db.insert(casingProbe).values({ pitchId: 1, ownerName: 'alice', explicitlyNamed: 10 });

      await client.query(insertStatement(canonicalProbe()), [2, 'betty', 20]);

      const rows = await db.select().from(casingProbe).orderBy(asc(casingProbe.pitchId));
      deq(rows, [
        { pitchId: 1, ownerName: 'alice', explicitlyNamed: 10 },
        { pitchId: 2, ownerName: 'betty', explicitlyNamed: 20 },
      ]);
    });
  });
});
