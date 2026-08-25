const { describe, it } = require('node:test');
const { equal: eq, deepEqual: deq, ok, rejects } = require('node:assert');
const { mkdtemp, readdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Writable } = require('node:stream');
const { int, mysqlTable, varchar: mysqlVarchar } = require('drizzle-orm/mysql-core');
const { integer, pgTable, unique, varchar } = require('drizzle-orm/pg-core');
const { createRecordingSink, rowsOf } = require('./lib/recording-sink');
const {
  createInMemoryGraphSink,
  createMariaDbSqlFileSink,
  createPostgresSqlFileSink,
  createPostgresSqlStreamSink,
  createRowBatchSink,
  derive,
  generate,
  structuralDefault,
} = require('../lib');

const SEED = 11;

// A reading is a measurement: no identity of its own, which is exactly the shape S04's
// adapter-time rule made impossible to generate.
const readings = pgTable('readings', {
  label: varchar('label', { length: 20 }).notNull(),
  value: integer('value').notNull(),
});

const readingRules = { readings: { label: structuralDefault, value: structuralDefault } };

const generateReadings = (sink, count = 3) =>
  generate({ schema: { readings }, rules: readingRules, counts: { readings: count }, seed: SEED }, sink);

describe('a table with no primary key', () => {
  it('generates into the in-memory graph', async () => {
    const data = await generateReadings(createInMemoryGraphSink());

    eq(data.rows.readings.length, 3);
    for (const row of data.rows.readings) ok(typeof row.label === 'string' && typeof row.value === 'number');
  });

  it('generates through the row batch sink', async () => {
    const batches = [];
    await generateReadings(createRowBatchSink((batch) => batches.push(batch)));

    deq(
      batches.map((batch) => batch.tableKey),
      ['readings'],
    );
    eq(batches[0].rows.length, 3);
  });

  it('generates through the psql file sink', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'drizzle-super-seed-'));
    await generateReadings(createPostgresSqlFileSink({ directory }));

    ok((await readdir(directory)).includes('0010_readings.sql'));
    await rm(directory, { recursive: true, force: true });
  });

  it('generates through the psql stream sink', async () => {
    const written = [];
    const writable = new Writable({
      write(chunk, _encoding, done) {
        written.push(String(chunk));
        done();
      },
    });
    await generateReadings(createPostgresSqlStreamSink({ writable }));

    const sql = written.join('');
    ok(sql.includes('COPY "public"."readings"'), sql.slice(0, 200));
  });

  it('generates through the mariadb file sink', async () => {
    const measurements = mysqlTable('measurements', {
      label: mysqlVarchar('label', { length: 20 }).notNull(),
      value: int('value').notNull(),
    });

    const directory = await mkdtemp(join(tmpdir(), 'drizzle-super-seed-'));
    await generate(
      {
        schema: { measurements },
        rules: { measurements: { label: structuralDefault, value: structuralDefault } },
        counts: { measurements: 3 },
        seed: SEED,
      },
      createMariaDbSqlFileSink({ directory }),
    );

    ok((await readdir(directory)).includes('0010_measurements.sql'));
    await rm(directory, { recursive: true, force: true });
  });

  it('supplies foreign key values to a child, because pools key on the referenced column', async () => {
    const stations = pgTable('stations', {
      code: varchar('code', { length: 8 }).notNull().unique(),
      name: varchar('name', { length: 40 }).notNull(),
    });

    const samples = pgTable('samples', {
      id: integer('id').primaryKey(),
      stationCode: varchar('station_code', { length: 8 })
        .notNull()
        .references(() => stations.code),
    });

    const result = await generate(
      {
        schema: { stations, samples },
        rules: {
          stations: { code: derive((_row, context) => `S${context.rowIndex}`), name: structuralDefault },
          samples: { id: structuralDefault, stationCode: structuralDefault },
        },
        counts: { stations: 2, samples: 6 },
        seed: SEED,
      },
      createRecordingSink(),
    );

    const codes = new Set(rowsOf(result, 'stations').map((row) => row.code));
    const used = rowsOf(result, 'samples').map((row) => row.stationCode);

    eq(used.length, 6);
    for (const code of used) ok(codes.has(code), `${code} is not a generated station`);
  });

  it('plans no zero-column constraint, so a second row is not a collision', async () => {
    const data = await generateReadings(createInMemoryGraphSink(), 50);

    eq(data.rows.readings.length, 50);
  });

  it('still enforces a unique constraint it does declare', async () => {
    const slots = pgTable(
      'slots',
      {
        label: varchar('label', { length: 8 }).notNull(),
        bay: integer('bay').notNull(),
      },
      (table) => [unique('slots_bay_key').on(table.bay)],
    );

    await rejects(
      generate(
        {
          schema: { slots },
          rules: { slots: { label: structuralDefault, bay: derive(() => 1) } },
          counts: { slots: 5 },
          seed: SEED,
        },
        createRecordingSink(),
      ),
      { name: 'UniqueConstraintExhaustedError', table: 'slots', columns: ['bay'] },
    );
  });
});

describe('the two features which do need a primary key', () => {
  it('refuses a per-parent count on a parent with none, naming the parent and the child', async () => {
    const bays = pgTable('bays', { code: varchar('code', { length: 8 }).notNull().unique() });

    const slots = pgTable('slots', {
      id: integer('id').primaryKey(),
      bayCode: varchar('bay_code', { length: 8 })
        .notNull()
        .references(() => bays.code),
    });

    const sink = createRecordingSink();

    await rejects(
      generate(
        {
          schema: { bays, slots },
          rules: {
            bays: { code: derive((_row, context) => `B${context.rowIndex}`) },
            slots: { id: structuralDefault, bayCode: structuralDefault },
          },
          counts: { bays: 2, slots: { per: 'bays', count: 2 } },
          seed: SEED,
        },
        sink,
      ),
      {
        name: 'MissingPrimaryKeyError',
        table: 'bays',
        reason: 'perParent',
        message:
          'Table bays has no primary key, but slots is counted per bays row and the engine iterates ' +
          "the parent's primary key to do that. Give bays a primary key, or count slots with a plain number.",
      },
    );

    // Validation runs before any row: the sink never saw the table begin.
    deq(sink.end({}).calls, ['end']);
  });

  it('refuses a deferred column on an owner with none, naming the column and the pass', async () => {
    const halls = pgTable('halls', {
      name: varchar('name', { length: 20 }).notNull(),
      wardenId: integer('warden_id').references(() => wardens.id),
    });

    const wardens = pgTable('wardens', {
      id: integer('id').primaryKey(),
      hallName: varchar('hall_name', { length: 20 })
        .notNull()
        .references(() => halls.name),
    });

    const sink = createRecordingSink();

    await rejects(
      generate(
        {
          schema: { halls, wardens },
          rules: {
            halls: { name: derive((_row, context) => `H${context.rowIndex}`), wardenId: structuralDefault },
            wardens: { id: structuralDefault, hallName: structuralDefault },
          },
          counts: { halls: 2, wardens: 2 },
          seed: SEED,
        },
        sink,
      ),
      {
        name: 'MissingPrimaryKeyError',
        table: 'halls',
        reason: 'deferredColumn',
        column: 'wardenId',
        message:
          'Table halls has no primary key, but it owns the deferred foreign key column wardenId, and ' +
          'the second pass identifies the rows it patches by primary key. Give halls a primary key, or ' +
          'break the cycle elsewhere.',
      },
    );

    deq(sink.end({}).calls, ['end']);
  });
});
