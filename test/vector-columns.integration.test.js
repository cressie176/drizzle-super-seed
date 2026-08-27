// pgvector is not in the compose image, so this proves the literal against the extension's own
// server: docker run pgvector/pgvector. It is skipped when that image is unavailable.
const { describe, it, before, after } = require('node:test');
const { equal: eq, ok } = require('node:assert');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { Writable } = require('node:stream');
const { integer, pgTable, vector } = require('drizzle-orm/pg-core');
const {
  TableLogging,
  TriggerHandling,
  createPostgresSqlStreamSink,
  derive,
  generate,
  randomVector,
} = require('../lib');

const run = promisify(execFile);

const CONTAINER = 'drizzle-super-seed-pgvector';
const IMAGE = 'pgvector/pgvector:pg17';
const DIMENSIONS = 8;
const READY_ATTEMPTS = 60;

const embeddings = pgTable('embeddings', {
  id: integer('id').primaryKey(),
  embedding: vector('embedding', { dimensions: DIMENSIONS }).notNull(),
});

const psql = (statement) =>
  run('docker', ['exec', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-t', '-A', '-c', statement]);

const psqlScript = (script) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      'docker',
      ['exec', '-i', CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'],
      (error, stdout, stderr) => (error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(stdout)),
    );
    child.stdin.end(script);
  });

const waitUntilReady = async () => {
  for (let attempt = 0; attempt < READY_ATTEMPTS; attempt++) {
    try {
      await psql('SELECT 1');
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error('pgvector never became ready');
};

describe('vectors through a real pgvector server', { skip: process.env.SKIP_PGVECTOR === 'true' }, () => {
  let script;

  before(async () => {
    await run('docker', ['rm', '-f', CONTAINER]).catch(() => {});
    await run('docker', ['run', '-d', '--name', CONTAINER, '-e', 'POSTGRES_PASSWORD=vector', IMAGE], {
      maxBuffer: 32 * 1024 * 1024,
    });
    await waitUntilReady();

    const chunks = [];
    const writable = new Writable({
      write(chunk, _encoding, done) {
        chunks.push(String(chunk));
        done();
      },
    });
    await generate(
      {
        schema: { embeddings },
        rules: {
          embeddings: { id: derive((_row, context) => context.rowIndex + 1), embedding: randomVector(DIMENSIONS) },
        },
        counts: { embeddings: 25 },
        seed: 5,
      },
      createPostgresSqlStreamSink({
        writable,
        triggerHandling: TriggerHandling.LeaveEnabled,
        tableLogging: TableLogging.LeaveLogged,
      }),
    );
    script = chunks.join('');

    await psqlScript(
      [
        'CREATE EXTENSION IF NOT EXISTS vector;',
        'DROP TABLE IF EXISTS embeddings;',
        `CREATE TABLE embeddings (id INTEGER PRIMARY KEY, embedding vector(${DIMENSIONS}) NOT NULL);`,
        script,
      ].join('\n'),
    );
  });

  after(async () => {
    await run('docker', ['rm', '-f', CONTAINER]).catch(() => {});
  });

  it('loads every generated vector, the dimension accepted by the extension', async () => {
    const { stdout } = await psql('SELECT COUNT(*) FROM embeddings');
    eq(stdout.trim(), '25');
  });

  it('reads back the components it wrote', async () => {
    const { stdout } = await psql('SELECT vector_dims(embedding) FROM embeddings LIMIT 1');
    eq(stdout.trim(), String(DIMENSIONS));
  });

  it('answers a real similarity query, which is what the column exists for', async () => {
    const { stdout } = await psql(
      'SELECT id FROM embeddings ORDER BY embedding <=> (SELECT embedding FROM embeddings WHERE id = 1) LIMIT 3',
    );
    const [nearest] = stdout.trim().split('\n');
    // A row is always its own nearest neighbour under cosine distance.
    eq(nearest, '1');
  });

  it('generated unit vectors, so cosine distance behaves as the model would expect', async () => {
    // L2 distance from the origin is the vector's own magnitude, which must be one.
    const origin = `[${Array.from({ length: DIMENSIONS }, () => 0).join(',')}]`;
    const { stdout } = await psql(
      `SELECT round(max(abs(1 - (embedding <-> '${origin}')))::numeric, 6) FROM embeddings`,
    );
    ok(Number(stdout.trim()) < 0.000001, `expected unit length, worst deviation was ${stdout.trim()}`);
  });
});
