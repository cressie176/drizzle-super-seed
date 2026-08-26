const { describe, it } = require('node:test');
const { equal: eq, match, ok } = require('node:assert');
const { mkdtemp, readFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { sql } = require('drizzle-orm');
const { integer, pgTable, varchar } = require('drizzle-orm/pg-core');
const {
  TableLogging,
  createPostgresSqlFileSink,
  extractCanonicalSchema,
  generate,
  structuralDefault,
} = require('../lib');

const SEED = 33;

// drizzle-kit pull renders a serial column this way: a plain integer whose default calls the
// sequence. The catalogue does not link them, so pg_get_serial_sequence returns NULL for it.
const films = pgTable('films', {
  id: integer('film_id').default(sql`nextval('film_film_id_seq'::regclass)`).primaryKey().notNull(),
  title: varchar('title', { length: 40 }).notNull(),
});

describe('nextval defaults', () => {
  it('marks the column sequence-owned and records the sequence name', () => {
    const column = extractCanonicalSchema({ films }).tables.get('films').columns[0];

    eq(column.sequenceOwned, true);
    eq(column.sequenceName, 'film_film_id_seq');
  });

  it('reads a schema-qualified sequence the same way', () => {
    const probe = pgTable('probe', {
      id: integer('id').default(sql`nextval('archive.probe_id_seq'::regclass)`).primaryKey(),
    });

    eq(extractCanonicalSchema({ probe }).tables.get('probe').columns[0].sequenceName, 'archive.probe_id_seq');
  });

  it('leaves an ordinary default alone', () => {
    const probe = pgTable('probe', {
      id: integer('id').primaryKey(),
      attempts: integer('attempts').default(3).notNull(),
    });

    const attempts = extractCanonicalSchema({ probe }).tables.get('probe').columns[1];
    eq(attempts.sequenceOwned, false);
    eq('sequenceName' in attempts, false);
  });

  it('numbers rows from the engine counter under structuralDefault', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'drizzle-super-seed-'));
    await generate(
      {
        schema: { films },
        rules: { films: { id: structuralDefault, title: structuralDefault } },
        counts: { films: 3 },
        seed: SEED,
      },
      createPostgresSqlFileSink({ directory, tableLogging: TableLogging.LeaveLogged }),
    );
    const rows = (await readFile(join(directory, '0010_films.sql'), 'utf8'))
      .split('\n')
      .filter((line) => /^\d+\t/.test(line));

    eq(rows.length, 3);
    ok(rows[0].startsWith('1\t') && rows[2].startsWith('3\t'));
  });

  it('setvals the sequence by its recorded name, which the catalogue cannot supply', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'drizzle-super-seed-'));
    await generate(
      {
        schema: { films },
        rules: { films: { id: structuralDefault, title: structuralDefault } },
        counts: { films: 3 },
        seed: SEED,
      },
      createPostgresSqlFileSink({ directory, tableLogging: TableLogging.LeaveLogged }),
    );

    match(await readFile(join(directory, '9000_finalise.sql'), 'utf8'), /setval\('film_film_id_seq',\s*\(SELECT/);
  });
});
