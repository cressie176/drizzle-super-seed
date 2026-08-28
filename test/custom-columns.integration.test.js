const { describe, it, before, after } = require('node:test');
const { equal: eq } = require('node:assert');
const { Writable } = require('node:stream');
const { customType, integer, pgTable } = require('drizzle-orm/pg-core');
const { derive, generate, createPostgresSqlStreamSink } = require('../lib');
const { executeScript, queryValue } = require('./lib/psql');

const SEED = 21;

// A real custom type: a domain over text with a constraint, which drizzle can only declare
// through customType. The rule supplies values the domain accepts; the serialiser writes them
// as text and the server does the checking.
const parkCode = customType({ dataType: () => 'park_code' });

// A customType wrapping a numeric type, which is the case that catches the serialiser out: the
// wrapped SQL type is an opaque string, so nothing downstream knows a boolean must not be written
// as PostgreSQL's own 't'.
const openFlag = customType({ dataType: () => 'smallint' });

const sites = pgTable('sites', {
  id: integer('id').primaryKey(),
  code: parkCode('code').notNull(),
  open: openFlag('open').notNull(),
});

describe('a custom domain column through a real load', () => {
  before(async () => {
    const chunks = [];
    const writable = new Writable({
      write(chunk, _encoding, done) {
        chunks.push(String(chunk));
        done();
      },
    });
    await generate(
      {
        schema: { sites },
        rules: {
          sites: {
            id: derive((_row, context) => context.rowIndex + 1),
            code: derive((_row, context) => `PK-${String(context.rowIndex).padStart(4, '0')}`),
            open: derive((_row, context) => context.rowIndex % 2 === 0),
          },
        },
        counts: { sites: 5 },
        seed: SEED,
      },
      createPostgresSqlStreamSink({ writable }),
    );

    await executeScript(
      [
        'DROP TABLE IF EXISTS sites;',
        'DROP DOMAIN IF EXISTS park_code;',
        "CREATE DOMAIN park_code AS TEXT CHECK (VALUE ~ '^PK-[0-9]{4}$');",
        'CREATE TABLE sites (id INTEGER PRIMARY KEY, code park_code NOT NULL, open SMALLINT NOT NULL);',
        chunks.join(''),
      ].join('\n'),
    );
  });

  after(async () => {
    await executeScript('DROP TABLE IF EXISTS sites; DROP DOMAIN IF EXISTS park_code;');
  });

  it('loads every row, each value accepted by the domain constraint', async () => {
    eq(await queryValue('SELECT COUNT(*) FROM sites'), '5');
    eq(await queryValue('SELECT code FROM sites WHERE id = 3'), 'PK-0002');
  });

  it('wrote a boolean rule into the smallint the custom type wraps', async () => {
    eq(await queryValue('SELECT open FROM sites WHERE id = 1'), '1');
    eq(await queryValue('SELECT open FROM sites WHERE id = 2'), '0');
  });

  it('went unlogged like any other table, the custom column notwithstanding', async () => {
    eq(await queryValue("SELECT relpersistence FROM pg_class WHERE relname = 'sites'"), 'u');
  });
});
