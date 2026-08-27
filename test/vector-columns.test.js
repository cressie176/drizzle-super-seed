const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, match, ok, rejects } = require('node:assert');
const { Writable } = require('node:stream');
const { integer, pgTable, vector } = require('drizzle-orm/pg-core');
const { createRecordingSink, rowsOf } = require('./lib/recording-sink');
const {
  ColumnKind,
  TableLogging,
  TriggerHandling,
  createPostgresSqlStreamSink,
  derive,
  extractCanonicalSchema,
  generate,
  optional,
  randomVector,
  structuralDefault,
} = require('../lib');

const SEED = 31;

const DIMENSIONS = 8;

const embeddings = pgTable('embeddings', {
  id: integer('id').primaryKey(),
  optionalVector: vector('optional_vector', { dimensions: DIMENSIONS }),
  requiredVector: vector('required_vector', { dimensions: DIMENSIONS }).notNull(),
});

const rowNumber = derive((_row, context) => context.rowIndex + 1);

const generateEmbeddings = (rules, counts = { embeddings: 20 }) =>
  generate({ schema: { embeddings }, rules, counts, seed: SEED }, createRecordingSink());

describe('vector columns in the adapter', () => {
  it('records the kind and the declared dimension', () => {
    const columns = extractCanonicalSchema({ embeddings }).tables.get('embeddings').columns;

    eq(columns[1].kind, ColumnKind.Vector);
    eq(columns[1].dimensions, DIMENSIONS);
    eq(columns[1].jsType, 'array');
    eq(columns[2].notNull, true);
  });

  it('records no dimension for a vector which declares none', () => {
    const loose = pgTable('loose', { id: integer('id').primaryKey(), embedding: vector('embedding', {}) });

    const column = extractCanonicalSchema({ loose }).tables.get('loose').columns[1];
    eq(column.kind, ColumnKind.Vector);
    eq('dimensions' in column, false);
  });
});

describe('the structural default for a vector', () => {
  it('generates the declared dimension when the column demands a value', async () => {
    const result = await generateEmbeddings({
      embeddings: { id: rowNumber, optionalVector: structuralDefault, requiredVector: structuralDefault },
    });

    for (const row of rowsOf(result, 'embeddings')) {
      eq(Array.isArray(row.requiredVector), true);
      eq(row.requiredVector.length, DIMENSIONS);
      for (const component of row.requiredVector) eq(Number.isFinite(component), true);
    }
  });

  it('leaves a nullable vector null, every row, rather than filling it', async () => {
    const result = await generateEmbeddings({
      embeddings: { id: rowNumber, optionalVector: structuralDefault, requiredVector: structuralDefault },
    });

    // Deliberately unlike every other nullable kind, which is 90% populated: a vector is orders
    // of magnitude more expensive per cell, so filling one is always an explicit choice.
    deq(
      rowsOf(result, 'embeddings').map((row) => row.optionalVector),
      Array.from({ length: 20 }, () => null),
    );
  });

  it('refuses only the case where nothing is derivable: a NOT NULL vector with no dimension', async () => {
    const loose = pgTable('loose', {
      id: integer('id').primaryKey(),
      embedding: vector('embedding', {}).notNull(),
    });

    await rejects(
      generate(
        {
          schema: { loose },
          rules: { loose: { id: rowNumber, embedding: structuralDefault } },
          counts: { loose: 1 },
          seed: SEED,
        },
        createRecordingSink(),
      ),
      {
        name: 'UndeclaredVectorDimensionError',
        table: 'loose',
        column: 'embedding',
        message:
          'Column loose.embedding is a vector which declares no dimension, so no value can be ' +
          'derived for a NOT NULL column. Declare the dimension, or write a rule for it.',
      },
    );
  });
});

describe('the randomVector generator', () => {
  it('is the generator the structural default uses, available to write down', async () => {
    const explicit = await generateEmbeddings({
      embeddings: { id: rowNumber, optionalVector: structuralDefault, requiredVector: randomVector(DIMENSIONS) },
    });
    const structural = await generateEmbeddings({
      embeddings: { id: rowNumber, optionalVector: structuralDefault, requiredVector: structuralDefault },
    });

    deq(
      rowsOf(explicit, 'embeddings').map((row) => row.requiredVector),
      rowsOf(structural, 'embeddings').map((row) => row.requiredVector),
    );
  });

  it('draws from the run seed, so a rerun replays the same vectors', async () => {
    const first = await generateEmbeddings({
      embeddings: { id: rowNumber, optionalVector: randomVector(DIMENSIONS), requiredVector: randomVector(DIMENSIONS) },
    });
    const second = await generateEmbeddings({
      embeddings: { id: rowNumber, optionalVector: randomVector(DIMENSIONS), requiredVector: randomVector(DIMENSIONS) },
    });

    deq(rowsOf(first, 'embeddings'), rowsOf(second, 'embeddings'));
  });

  it('emits unit vectors, which is what an embedding model produces', async () => {
    const result = await generateEmbeddings({
      embeddings: { id: rowNumber, optionalVector: structuralDefault, requiredVector: randomVector(DIMENSIONS) },
    });

    for (const row of rowsOf(result, 'embeddings')) {
      const length = Math.sqrt(row.requiredVector.reduce((total, part) => total + part * part, 0));
      ok(Math.abs(length - 1) < 1e-9, `expected a unit vector, got length ${length}`);
    }
  });

  it('populates a nullable vector at whatever rate the caller chooses', async () => {
    // An even split over forty rows: a degenerate outcome has probability 2^-40, so this cannot
    // flake the way a 90% null rate over twenty rows could.
    const result = await generateEmbeddings(
      {
        embeddings: {
          id: rowNumber,
          optionalVector: optional(randomVector(DIMENSIONS), 0.5),
          requiredVector: randomVector(DIMENSIONS),
        },
      },
      { embeddings: 40 },
    );

    const values = rowsOf(result, 'embeddings').map((row) => row.optionalVector);
    ok(
      values.some((value) => value !== null) && values.some((value) => value === null),
      `expected a mix, got ${values.filter(Boolean).length} populated of 40`,
    );
  });
});

describe('vectors through the serialisers', () => {
  const streamed = async (rules) => {
    const chunks = [];
    const writable = new Writable({
      write(chunk, _encoding, done) {
        chunks.push(String(chunk));
        done();
      },
    });
    await generate(
      { schema: { embeddings }, rules, counts: { embeddings: 1 }, seed: SEED },
      createPostgresSqlStreamSink({
        writable,
        triggerHandling: TriggerHandling.LeaveEnabled,
        tableLogging: TableLogging.LeaveLogged,
      }),
    );
    return chunks.join('');
  };

  it('writes the pgvector literal, not a postgres array literal', async () => {
    const script = await streamed({
      embeddings: {
        id: rowNumber,
        optionalVector: structuralDefault,
        requiredVector: derive(() => [0.5, -0.25, 0, 1, 0.125, -1, 0.75, 0.0625]),
      },
    });

    match(script, /\[0\.5,-0\.25,0,1,0\.125,-1,0\.75,0\.0625\]/);
  });

  it('refuses a vector whose length disagrees with the column, before the database sees it', async () => {
    await rejects(
      streamed({
        embeddings: { id: rowNumber, optionalVector: structuralDefault, requiredVector: derive(() => [0.1, 0.2]) },
      }),
      {
        name: 'VectorDimensionMismatchError',
        table: 'embeddings',
        column: 'requiredVector',
        expected: DIMENSIONS,
        actual: 2,
        message:
          'Column embeddings.requiredVector is a vector(8), but a rule produced 2 components. ' +
          'Generate the declared number, or correct the column.',
      },
    );
  });
});
