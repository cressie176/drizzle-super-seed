const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, match, ok, rejects } = require('node:assert');
const { Writable } = require('node:stream');
const { customType: mysqlCustomType, int, mysqlTable } = require('drizzle-orm/mysql-core');
const { customType: pgCustomType, integer, pgTable } = require('drizzle-orm/pg-core');
const { customType: sqliteCustomType, integer: sqliteInteger, sqliteTable } = require('drizzle-orm/sqlite-core');
const { createRecordingSink, rowsOf } = require('./lib/recording-sink');
const {
  ColumnKind,
  TableLogging,
  TriggerHandling,
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
