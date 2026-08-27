const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, match, ok, rejects } = require('node:assert');
const { mkdtemp, readFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Writable } = require('node:stream');
const { customType: mysqlCustomType, int, mysqlTable } = require('drizzle-orm/mysql-core');
const { customType: pgCustomType, integer, pgTable } = require('drizzle-orm/pg-core');
const { customType: sqliteCustomType, integer: sqliteInteger, sqliteTable } = require('drizzle-orm/sqlite-core');
const { createRecordingSink, rowsOf } = require('./lib/recording-sink');
const {
  ColumnKind,
  TableLogging,
  TriggerHandling,
  createCsvFileSink,
  createMariaDbSqlFileSink,
  createPostgresSqlStreamSink,
  derive,
  extractCanonicalSchema,
  generate,
  structuralDefault,
} = require('../lib');

const SEED = 21;

const ltree = pgCustomType({ dataType: () => 'ltree' });

const nodes = pgTable('nodes', {
  id: integer('id').primaryKey(),
  path: ltree('path').notNull(),
});

const rowNumber = derive((_row, context) => context.rowIndex + 1);

describe('custom columns in the adapter', () => {
  it('maps a postgres custom column, carrying the declared type name', () => {
    const column = extractCanonicalSchema({ nodes }).tables.get('nodes').columns[1];

    eq(column.kind, ColumnKind.Custom);
    eq(column.jsType, 'custom');
    eq(column.customType, 'ltree');
  });

  it('maps mysql and sqlite custom columns identically', () => {
    const point = mysqlCustomType({ dataType: () => 'point' });
    const places = mysqlTable('places', { id: int('id').primaryKey(), location: point('location') });
    const vector = sqliteCustomType({ dataType: () => 'vector(3)' });
    const embeddings = sqliteTable('embeddings', { id: sqliteInteger('id').primaryKey(), vec: vector('vec') });

    eq(extractCanonicalSchema({ places }).tables.get('places').columns[1].kind, ColumnKind.Custom);
    eq(extractCanonicalSchema({ places }).tables.get('places').columns[1].customType, 'point');
    eq(extractCanonicalSchema({ embeddings }).tables.get('embeddings').columns[1].customType, 'vector(3)');
  });
});

describe('custom columns in the engine', () => {
  it('generates whatever an explicit rule supplies, verbatim', async () => {
    const result = await generate(
      {
        schema: { nodes },
        rules: { nodes: { id: rowNumber, path: derive((_row, context) => `park.zone_${context.rowIndex}`) } },
        counts: { nodes: 3 },
        seed: SEED,
      },
      createRecordingSink(),
    );

    deq(
      rowsOf(result, 'nodes').map((row) => row.path),
      ['park.zone_0', 'park.zone_1', 'park.zone_2'],
    );
  });

  it('refuses structuralDefault, naming the type and the remedy, before any row', async () => {
    const sink = createRecordingSink();

    await rejects(
      generate(
        {
          schema: { nodes },
          rules: { nodes: { id: rowNumber, path: structuralDefault } },
          counts: { nodes: 1 },
          seed: SEED,
        },
        sink,
      ),
      {
        name: 'CustomColumnRuleRequiredError',
        table: 'nodes',
        column: 'path',
        customType: 'ltree',
        message:
          'Column nodes.path is the custom type ltree, which declares nothing a default could be ' +
          'derived from. Write a rule for it.',
      },
    );

    deq(sink.end({}).calls, ['end']);
  });
});

describe('custom columns through the serialisers', () => {
  const streamed = async (rules) => {
    const chunks = [];
    const writable = new Writable({
      write(chunk, _encoding, done) {
        chunks.push(String(chunk));
        done();
      },
    });
    await generate(
      { schema: { nodes }, rules, counts: { nodes: 1 }, seed: SEED },
      createPostgresSqlStreamSink({
        writable,
        triggerHandling: TriggerHandling.LeaveEnabled,
        tableLogging: TableLogging.LeaveLogged,
      }),
    );
    return chunks.join('');
  };

  it('writes a string value with the text escaping rules', async () => {
    const script = await streamed({ nodes: { id: rowNumber, path: () => 'park.zone\tA' } });

    match(script, /park\.zone\\tA/);
  });

  it('refuses a value with no text form, naming the column', async () => {
    await rejects(streamed({ nodes: { id: rowNumber, path: () => ({ not: 'text' }) } }), {
      name: 'UnserialisableValueError',
      table: 'nodes',
      column: 'path',
    });
  });
});

// A custom column's value is written by its own runtime type, because the library cannot know
// the database type's text form but the rule's author does. Every serialiser must agree.
describe('custom columns through the csv serialiser', () => {
  const csvRow = async (rules) => {
    const directory = await mkdtemp(join(tmpdir(), 'drizzle-super-seed-'));
    await generate({ schema: { nodes }, rules, counts: { nodes: 1 }, seed: SEED }, createCsvFileSink({ directory }));
    const [, row] = (await readFile(join(directory, 'seed-0010_nodes.csv'), 'utf8')).trim().split('\n');
    return row;
  };

  it('writes a string value, quoted when the csv rules demand it', async () => {
    eq(await csvRow({ nodes: { id: rowNumber, path: () => 'park.zone,A' } }), '1,"park.zone,A"');
  });

  it('writes a Date as RFC 3339, like any other timestamp in the file', async () => {
    eq(
      await csvRow({ nodes: { id: rowNumber, path: () => new Date('2024-06-01T12:30:45.123Z') } }),
      '1,2024-06-01T12:30:45.123Z',
    );
  });

  it('writes a number, a bigint and a boolean in the formats the file uses', async () => {
    eq(await csvRow({ nodes: { id: rowNumber, path: () => 42.5 } }), '1,42.5');
    eq(await csvRow({ nodes: { id: rowNumber, path: () => 9007199254740993n } }), '1,9007199254740993');
    eq(await csvRow({ nodes: { id: rowNumber, path: () => true } }), '1,1');
  });

  it('refuses a value with no text form, naming the column', async () => {
    await rejects(csvRow({ nodes: { id: rowNumber, path: () => ({ not: 'text' }) } }), {
      name: 'UnserialisableValueError',
      table: 'nodes',
      column: 'path',
    });
  });
});

describe('custom columns through the mariadb serialiser', () => {
  const point = mysqlCustomType({ dataType: () => 'point' });

  const places = mysqlTable('places', {
    id: int('id').primaryKey(),
    location: point('location').notNull(),
  });

  const insertStatement = async (rules) => {
    const directory = await mkdtemp(join(tmpdir(), 'drizzle-super-seed-'));
    await generate(
      { schema: { places }, rules, counts: { places: 1 }, seed: SEED },
      createMariaDbSqlFileSink({ directory }),
    );
    return readFile(join(directory, 'seed-0010_places.sql'), 'utf8');
  };

  it('writes a string value as a quoted literal, escaped', async () => {
    // The single quote is doubled, which is how this serialiser escapes it in any string.
    match(
      await insertStatement({ places: { id: rowNumber, location: () => "POINT(1 2)'" } }),
      /\(1,'POINT\(1 2\)'''\)/,
    );
  });

  it('writes a Date as a datetime literal', async () => {
    match(
      await insertStatement({ places: { id: rowNumber, location: () => new Date('2024-06-01T12:30:45.000Z') } }),
      /'2024-06-01 12:30:45\.000000'/,
    );
  });

  it('writes numbers and booleans unquoted', async () => {
    match(await insertStatement({ places: { id: rowNumber, location: () => 42.5 } }), /\(1,42\.5\)/);
    match(await insertStatement({ places: { id: rowNumber, location: () => false } }), /\(1,0\)/);
  });

  it('refuses a value with no literal form, naming the column', async () => {
    await rejects(insertStatement({ places: { id: rowNumber, location: () => ({ not: 'text' }) } }), {
      name: 'UnserialisableValueError',
      table: 'places',
      column: 'location',
    });
  });
});
