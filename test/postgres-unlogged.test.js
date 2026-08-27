const { describe, it } = require('node:test');
const { equal: eq, match, doesNotMatch, ok, deepEqual: deq } = require('node:assert');
const { mkdtemp, readFile, readdir } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Writable } = require('node:stream');
const { integer, pgTable, varchar } = require('drizzle-orm/pg-core');
const {
  TableLogging,
  createPostgresSqlFileSink,
  createPostgresSqlStreamSink,
  derive,
  generate,
  structuralDefault,
} = require('../lib');

const SEED = 9;

const parks = pgTable('parks', { id: integer('id').primaryKey(), name: varchar('name', { length: 30 }).notNull() });

const pitches = pgTable('pitches', {
  id: integer('id').primaryKey(),
  parkId: integer('park_id')
    .notNull()
    .references(() => parks.id),
});

// In the schema module but uncounted: created by the user's DDL, so it must go unlogged with the
// rest, or its logged foreign key would make the parks ALTER fail with 42P16.
const inspections = pgTable('inspections', {
  id: integer('id').primaryKey(),
  parkId: integer('park_id')
    .notNull()
    .references(() => parks.id),
});

const rowNumber = derive((_row, context) => context.rowIndex + 1);

const rules = {
  parks: { id: rowNumber, name: structuralDefault },
  pitches: { id: rowNumber, parkId: structuralDefault },
  inspections: { id: rowNumber, parkId: structuralDefault },
};

const generateFiles = async (options = {}) => {
  const directory = await mkdtemp(join(tmpdir(), 'drizzle-super-seed-'));
  await generate(
    { schema: { parks, pitches, inspections }, rules, counts: { parks: 2, pitches: 3 }, seed: SEED },
    createPostgresSqlFileSink({ directory, ...options }),
  );
  return directory;
};

describe('unlogged tables in the psql file sink', () => {
  it('writes the alter file by default, first in the load order', async () => {
    const directory = await generateFiles();

    ok((await readdir(directory)).includes('seed-0000_set_unlogged.sql'));
    match(
      await readFile(join(directory, 'load.psql'), 'utf8'),
      /^\\set ON_ERROR_STOP on\n\\ir seed-0000_set_unlogged\.sql\n/,
    );
  });

  it('alters children before parents, every schema table included', async () => {
    const directory = await generateFiles();
    const script = await readFile(join(directory, 'seed-0000_set_unlogged.sql'), 'utf8');
    const order = [...script.matchAll(/ALTER TABLE "public"\."(\w+)" SET UNLOGGED;/g)].map(([, name]) => name);

    deq([...order].sort(), ['inspections', 'parks', 'pitches'].sort());
    ok(order.indexOf('pitches') < order.indexOf('parks'), 'a child must be altered before its parent');
    ok(order.indexOf('inspections') < order.indexOf('parks'), 'the uncounted child too');
  });

  it('explains the one failure the file can hit, code and remedy included', async () => {
    const directory = await generateFiles();
    const script = await readFile(join(directory, 'seed-0000_set_unlogged.sql'), 'utf8');

    match(script, /42P16/);
    match(script, /could not change table/);
    match(script, /TableLogging\.LeaveLogged/);
  });

  it('records the choice in the manifest, alter file included', async () => {
    const directory = await generateFiles();
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));

    eq(manifest.tableLogging, 'SetUnlogged');
    eq(manifest.files[0], 'seed-0000_set_unlogged.sql');
  });

  it('leaves tables logged when told to, with no trace of the file', async () => {
    const directory = await generateFiles({ tableLogging: TableLogging.LeaveLogged });
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));

    eq((await readdir(directory)).includes('seed-0000_set_unlogged.sql'), false);
    doesNotMatch(await readFile(join(directory, 'load.psql'), 'utf8'), /set_unlogged/);
    eq(manifest.tableLogging, 'LeaveLogged');
    eq(
      manifest.files.some((file) => file.includes('set_unlogged')),
      false,
    );
  });
});

describe('a schema with a reference cycle', () => {
  const wardens = pgTable('wardens', {
    id: integer('id').primaryKey(),
    hallId: integer('hall_id')
      .notNull()
      .references(() => halls.id),
  });
  const halls = pgTable('halls', {
    id: integer('id').primaryKey(),
    wardenId: integer('warden_id').references(() => wardens.id),
    parkId: integer('park_id')
      .notNull()
      .references(() => parks.id),
  });
  const bookings = pgTable('bookings', {
    id: integer('id').primaryKey(),
    hallId: integer('hall_id')
      .notNull()
      .references(() => halls.id),
  });

  it('keeps the cycle and everything it references logged, and says which and why', async () => {
    const chunks = [];
    const writable = new Writable({
      write(chunk, _encoding, done) {
        chunks.push(String(chunk));
        done();
      },
    });
    await generate(
      {
        schema: { parks, wardens, halls, bookings },
        rules: {
          parks: { id: rowNumber, name: structuralDefault },
          wardens: { id: rowNumber, hallId: structuralDefault },
          halls: { id: rowNumber, wardenId: structuralDefault, parkId: structuralDefault },
          bookings: { id: rowNumber, hallId: structuralDefault },
        },
        counts: { parks: 1, wardens: 2, halls: 2, bookings: 2 },
        seed: SEED,
      },
      createPostgresSqlStreamSink({ writable }),
    );
    const script = chunks.join('');
    const altered = [...script.matchAll(/ALTER TABLE "public"\."(\w+)" SET UNLOGGED;/g)].map(([, name]) => name);

    // halls and wardens form the cycle; parks is referenced by halls, so it must stay logged
    // too; bookings only points into the cycle, which PostgreSQL allows, so it still flips.
    deq(altered, ['bookings']);
    match(script, /halls.*wardens.*stay logged|wardens.*halls.*stay logged/s);
  });
});

describe('unlogged tables in the psql stream sink', () => {
  const streamed = async (options = {}) => {
    const chunks = [];
    const writable = new Writable({
      write(chunk, _encoding, done) {
        chunks.push(String(chunk));
        done();
      },
    });
    await generate(
      { schema: { parks, pitches, inspections }, rules, counts: { parks: 2, pitches: 3 }, seed: SEED },
      createPostgresSqlStreamSink({ writable, ...options }),
    );
    return chunks.join('');
  };

  it('alters every schema table, children first, before any data', async () => {
    const script = await streamed();
    const alterBlock = script.indexOf('ALTER TABLE');
    const firstCopy = script.indexOf('COPY ');

    ok(alterBlock !== -1 && alterBlock < firstCopy, 'the alter block must precede the first COPY');
    const order = [...script.matchAll(/ALTER TABLE "public"\."(\w+)" SET UNLOGGED;/g)].map(([, name]) => name);
    deq([...order].sort(), ['inspections', 'parks', 'pitches'].sort());
    ok(order.indexOf('pitches') < order.indexOf('parks'));
  });

  it('emits no alter when told to leave tables logged', async () => {
    doesNotMatch(await streamed({ tableLogging: TableLogging.LeaveLogged }), /SET UNLOGGED/);
  });
});
