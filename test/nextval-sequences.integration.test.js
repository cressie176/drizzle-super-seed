const { describe, it, before, after } = require('node:test');
const { equal: eq } = require('node:assert');
const { Writable } = require('node:stream');
const { sql } = require('drizzle-orm');
const { integer, pgTable, varchar } = require('drizzle-orm/pg-core');
const { TableLogging, createPostgresSqlStreamSink, generate, structuralDefault } = require('../lib');
const { executeScript, queryValue } = require('./lib/psql');

const SEED = 33;

const films = pgTable('nextval_films', {
  id: integer('film_id').default(sql`nextval('nextval_film_id_seq'::regclass)`).primaryKey().notNull(),
  title: varchar('title', { length: 40 }).notNull(),
});

describe('a pulled serial through a real load', () => {
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
        schema: { films },
        rules: { films: { id: structuralDefault, title: structuralDefault } },
        counts: { films: 7 },
        seed: SEED,
      },
      createPostgresSqlStreamSink({ writable, tableLogging: TableLogging.LeaveLogged }),
    );

    await executeScript(
      [
        'DROP TABLE IF EXISTS nextval_films;',
        'DROP SEQUENCE IF EXISTS nextval_film_id_seq;',
        'CREATE SEQUENCE nextval_film_id_seq;',
        "CREATE TABLE nextval_films (film_id INTEGER PRIMARY KEY DEFAULT nextval('nextval_film_id_seq'), title VARCHAR(40) NOT NULL);",
        chunks.join(''),
      ].join('\n'),
    );
  });

  after(async () => {
    await executeScript('DROP TABLE IF EXISTS nextval_films; DROP SEQUENCE IF EXISTS nextval_film_id_seq;');
  });

  it('loads the rows and moves the sequence past them, catalogue ownership notwithstanding', async () => {
    eq(await queryValue('SELECT COUNT(*) FROM nextval_films'), '7');
    // The regression this exists for: before the fix, the finalise left the sequence at 1 and
    // this insert collided with film_id 1.
    eq(await queryValue("INSERT INTO nextval_films (title) VALUES ('next') RETURNING film_id"), '8');
  });
});
