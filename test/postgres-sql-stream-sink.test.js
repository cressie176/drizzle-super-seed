const { describe, it } = require('node:test');
const { equal: eq, ok } = require('node:assert');
const { mkdtemp, readFile, readdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { PassThrough, Writable } = require('node:stream');
const { TriggerHandling, createPostgresSqlFileSink, createPostgresSqlStreamSink, generate } = require('../lib');
const { structuralParkRules } = require('./lib/park-rules');
const parkSchema = require('./lib/park-schema');

const SEED = 42;
const REFERENCE_DATE = new Date('2024-06-01T00:00:00.000Z');

const COUNTS = { parks: 2, pitches: 3, owners: 4, holidayHomes: 2, accessories: 2, lettings: 2, parkOwners: 2 };

const collectingStream = () => {
  const chunks = [];
  const writable = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(chunk.toString());
      done();
    },
  });
  return { chunks, text: () => chunks.join(''), writable };
};

const generateTo = (writable, overrides = {}) =>
  generate(
    {
      schema: parkSchema,
      rules: structuralParkRules,
      counts: COUNTS,
      seed: SEED,
      referenceDate: REFERENCE_DATE,
      ...overrides,
    },
    createPostgresSqlStreamSink({ writable, triggerHandling: overrides.triggerHandling }),
  );

const GUARD = '\\set ON_ERROR_STOP on\n';

describe('postgres sql stream sink', () => {
  describe('the script it writes', () => {
    it('writes the same sql as the file sink, in one continuous script', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'drizzle-super-seed-'));
      await generate(
        {
          schema: parkSchema,
          rules: structuralParkRules,
          counts: COUNTS,
          seed: SEED,
          referenceDate: REFERENCE_DATE,
        },
        createPostgresSqlFileSink({ directory }),
      );
      const stream = collectingStream();
      await generateTo(stream.writable);

      const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
      const concatenated = [];
      for (const file of files) concatenated.push(await readFile(join(directory, file), 'utf8'));

      // The SQL is identical; only the ON_ERROR_STOP guard is placed differently, and deliberately
      // so. Every file carries it, because any one of them may be loaded on its own, whereas the
      // stream is a single script and carries it once at the head.
      const withoutGuard = (text) => text.replaceAll(GUARD, '');

      eq(withoutGuard(stream.text()), withoutGuard(concatenated.join('')));
      eq(stream.text().split(GUARD).length - 1, 1);
      eq(concatenated.join('').split(GUARD).length - 1, files.length);
      await rm(directory, { recursive: true, force: true });
    });

    it('opens a transaction and a copy block per table', async () => {
      const stream = collectingStream();
      await generateTo(stream.writable);

      eq(stream.text().split('BEGIN;').length - 1, Object.keys(COUNTS).length + 1);
      eq(stream.text().split('FROM stdin;').length - 1, Object.keys(COUNTS).length);
    });

    it('ends with the finalise block', async () => {
      const stream = collectingStream();
      await generateTo(stream.writable);

      ok(stream.text().endsWith('COMMIT;\nANALYZE;\n'));
    });

    it('writes no orchestrator and no manifest', async () => {
      const stream = collectingStream();
      await generateTo(stream.writable);

      ok(!stream.text().includes('\\ir '));
      ok(!stream.text().includes('manifest'));
    });

    it('leaves the replication role alone when asked to', async () => {
      const stream = collectingStream();
      await generateTo(stream.writable, { triggerHandling: TriggerHandling.LeaveEnabled });

      ok(!stream.text().includes('session_replication_role'));
    });

    it('returns the generation report', async () => {
      const stream = collectingStream();
      const report = await generateTo(stream.writable);

      eq(report.seed, SEED);
      eq(report.rowCounts.parks, COUNTS.parks);
    });
  });

  describe('the stream lifecycle', () => {
    it('never ends the writable it was given', async () => {
      const stream = collectingStream();
      await generateTo(stream.writable);

      eq(stream.writable.writableEnded, false);
      ok(stream.writable.writable);
    });

    it('leaves a passthrough open for the caller to end', async () => {
      const writable = new PassThrough();
      const received = [];
      writable.on('data', (chunk) => received.push(chunk.toString()));

      await generateTo(writable, { counts: { parks: 1 } });

      eq(writable.writableEnded, false);
      writable.end();
      ok(received.join('').includes('COPY "public"."parks"'));
    });
  });

  describe('back pressure', () => {
    // A stream which only completes a write on the next turn of the event loop, so a sink
    // which ignored the return value of write() would leave its whole script queued.
    const slowStream = () =>
      new Writable({
        highWaterMark: 64,
        write(_chunk, _encoding, done) {
          setImmediate(done);
        },
      });

    it('leaves nothing queued in the stream when generate resolves', async () => {
      const writable = slowStream();

      await generateTo(writable, { counts: { parks: 300 }, batchSize: 1 });

      eq(writable.writableLength, 0);
    });

    it('holds the same guarantee for a single large batch', async () => {
      const writable = slowStream();

      await generateTo(writable, { counts: { parks: 300 } });

      eq(writable.writableLength, 0);
    });
  });
});
