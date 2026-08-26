const { describe, it, beforeEach } = require('node:test');
const { deepEqual: deq, equal: eq, match, ok, rejects } = require('node:assert');
const { mkdtemp, readFile, readdir, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { int, mysqlTable, varchar: mysqlVarchar } = require('drizzle-orm/mysql-core');
const { boolean, integer, pgTable, timestamp, varchar } = require('drizzle-orm/pg-core');
const { createCsvFileSink, createInMemoryGraphSink, derive, generate, structuralDefault } = require('../lib');

const SEED = 5;

const parks = pgTable('parks', {
  id: integer('id').primaryKey(),
  name: varchar('name', { length: 40 }).notNull(),
  active: boolean('active').notNull(),
  openedAt: timestamp('opened_at'),
});

const pitches = pgTable('pitches', {
  id: integer('id').primaryKey(),
  parkId: integer('park_id')
    .notNull()
    .references(() => parks.id),
});

const rowNumber = derive((_row, context) => context.rowIndex + 1);

const rules = {
  parks: {
    id: rowNumber,
    name: derive((_row, context) => `Park, "the" ${context.rowIndex}`),
    active: derive((_row, context) => context.rowIndex % 2 === 0),
    openedAt: derive((_row, context) => (context.rowIndex === 0 ? null : new Date('2024-06-01T12:30:45.123Z'))),
  },
  pitches: { id: rowNumber, parkId: structuralDefault },
};

describe('the csv file sink', () => {
  let directory;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'drizzle-super-seed-'));
  });

  const generateCsv = (options = {}) =>
    generate(
      { schema: { parks, pitches }, rules, counts: { parks: 2, pitches: 3 }, seed: SEED },
      createCsvFileSink({ directory, ...options }),
    );

  it('writes one numbered file per table and a manifest, in dependency order', async () => {
    await generateCsv();

    deq((await readdir(directory)).sort(), ['0010_parks.csv', '0020_pitches.csv', 'manifest.json']);
  });

  it('writes a header of database column names, then the rows', async () => {
    await generateCsv();
    const lines = (await readFile(join(directory, '0010_parks.csv'), 'utf8')).split('\n');

    eq(lines[0], 'id,name,active,opened_at');
    eq(lines[1], '1,"Park, ""the"" 0",1,');
    eq(lines[2], '2,"Park, ""the"" 1",0,2024-06-01T12:30:45.123Z');
  });

  it('omits the header when asked', async () => {
    await generateCsv({ header: false });
    const [first] = (await readFile(join(directory, '0010_parks.csv'), 'utf8')).split('\n');

    match(first, /^1,/);
  });

  it('emits the configured null token bare', async () => {
    await generateCsv({ nullToken: '\\N' });
    const lines = (await readFile(join(directory, '0010_parks.csv'), 'utf8')).split('\n');

    match(lines[1], /,\\N$/);
  });

  it('records the run in the manifest', async () => {
    await generateCsv();
    const recorded = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));

    eq(recorded.seed, SEED);
    deq(recorded.rowCounts, { parks: 2, pitches: 3 });
    deq(recorded.files, ['0010_parks.csv', '0020_pitches.csv']);
    eq(recorded.header, true);
    eq(recorded.nullToken, '');
    ok(typeof recorded.durationMs === 'number');
  });

  it('accepts any dialect, because csv has none', async () => {
    const readings = mysqlTable('readings', {
      id: int('id').primaryKey(),
      label: mysqlVarchar('label', { length: 20 }).notNull(),
    });

    await generate(
      {
        schema: { readings },
        rules: { readings: { id: rowNumber, label: structuralDefault } },
        counts: { readings: 2 },
        seed: SEED,
      },
      createCsvFileSink({ directory }),
    );

    ok((await readdir(directory)).includes('0010_readings.csv'));
  });

  it('refuses a directory which already holds something', async () => {
    await writeFile(join(directory, 'existing.txt'), 'occupied');

    await rejects(generateCsv(), { name: 'OutputDirectoryNotEmptyError' });
  });

  it('resolves a cyclic schema, writing final values with no patch step visible', async () => {
    const wardens = pgTable('wardens', {
      id: integer('id').primaryKey(),
      hallId: integer('hall_id')
        .notNull()
        .references(() => halls.id),
    });
    const halls = pgTable('halls', {
      id: integer('id').primaryKey(),
      wardenId: integer('warden_id').references(() => wardens.id),
    });

    const config = {
      schema: { wardens, halls },
      rules: {
        wardens: { id: rowNumber, hallId: structuralDefault },
        halls: { id: rowNumber, wardenId: structuralDefault },
      },
      counts: { wardens: 6, halls: 6 },
      seed: SEED,
    };

    await generate(config, createCsvFileSink({ directory }));
    const lines = (await readFile(join(directory, '0010_halls.csv'), 'utf8')).trim().split('\n').slice(1);
    const written = lines.map((line) => line.split(',')).map(([id, wardenId]) => [Number(id), wardenId]);

    // The same seed through the graph sink gives the rows after its deferred patch; the CSV
    // must hold exactly those final values, not the pass-one NULL placeholders.
    const graph = await generate(config, createInMemoryGraphSink());
    for (const [id, wardenId] of written) {
      const row = graph.rows.halls.find((hall) => hall.id === id);
      eq(wardenId, row.wardenId === null ? '' : String(row.wardenId), `hall ${id} disagrees with the graph`);
    }
    ok(
      written.some(([, wardenId]) => wardenId !== ''),
      'the deferred pass assigned nobody, weakening the fixture',
    );
  });

  it('still writes every table of a cyclic run, streamed or buffered', async () => {
    const wardens = pgTable('wardens', {
      id: integer('id').primaryKey(),
      hallId: integer('hall_id')
        .notNull()
        .references(() => halls.id),
    });
    const halls = pgTable('halls', {
      id: integer('id').primaryKey(),
      wardenId: integer('warden_id').references(() => wardens.id),
    });

    await generate(
      {
        schema: { wardens, halls, parks },
        rules: {
          wardens: { id: rowNumber, hallId: structuralDefault },
          halls: { id: rowNumber, wardenId: structuralDefault },
          parks: rules.parks,
        },
        counts: { wardens: 2, halls: 2, parks: 2 },
        seed: SEED,
      },
      createCsvFileSink({ directory }),
    );

    const names = (await readdir(directory)).sort();
    deq(names, ['0010_parks.csv', '0020_halls.csv', '0030_wardens.csv', 'manifest.json']);
  });
});
