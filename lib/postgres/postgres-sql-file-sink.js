const { once } = require('node:events');
const { createWriteStream } = require('node:fs');
const { mkdir, readdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { OutputDirectoryNotEmptyError } = require('../generation-errors');
const {
  TABLE_EPILOGUE,
  TriggerHandling,
  copyRows,
  deferredEpilogue,
  deferredPrologue,
  deferredRows,
  finaliseScript,
  tablePrologue,
  writeChunk,
} = require('./postgres-copy-script');
const { Dialect } = require('../canonical-schema');

const NUMBER_STEP = 10;
const NUMBER_WIDTH = 3;
const FINALISE_FILE = '900_finalise.sql';
const ORCHESTRATOR_FILE = 'load.psql';
const MANIFEST_FILE = 'manifest.json';
const INDENT = 2;

const fileNumber = (index) => String((index + 1) * NUMBER_STEP).padStart(NUMBER_WIDTH, '0');

const tableFileName = (index, table) => `${fileNumber(index)}_${table.key}.sql`;

const deferredFileName = (index, table, column) => `${fileNumber(index)}_deferred_${table.name}_${column.name}.sql`;

const keyColumnsOf = (table) => table.primaryKey.map((name) => table.columns.find((column) => column.name === name));

const deferredColumnOf = (table, updates) => {
  const [propertyName] = Object.keys(updates[0].values);
  return table.columns.find((column) => column.propertyName === propertyName);
};

const orchestrator = (files) => `\\set ON_ERROR_STOP on\n${files.map((file) => `\\ir ${file}\n`).join('')}`;

const manifest = ({ report, triggerHandling, files, generatedAt }) =>
  `${JSON.stringify(
    {
      seed: report.seed,
      referenceDate: report.referenceDate.toISOString(),
      rowCounts: report.rowCounts,
      durationMs: report.durationMs,
      generatedAt,
      triggerHandling,
      files,
    },
    null,
    INDENT,
  )}\n`;

const requireEmptyDirectory = async (directory) => {
  await mkdir(directory, { recursive: true });
  const entries = await readdir(directory);
  if (entries.length === 0) return;
  throw new OutputDirectoryNotEmptyError({ directory, entries });
};

const createPostgresSqlFileSink = ({ directory, triggerHandling = TriggerHandling.DisableDuringLoad }) => {
  const tables = [];
  const files = [];
  let prepared = null;
  let stream = null;
  let deferred = null;

  const prepare = () => {
    prepared = prepared ?? requireEmptyDirectory(directory);
    return prepared;
  };

  const closeStream = async () => {
    stream.end();
    await once(stream, 'close');
  };

  // One file per deferred column, opened when its first batch arrives and closed when the next
  // column starts or the run ends; the engine emits a column's updates consecutively.
  const closeDeferred = async () => {
    if (!deferred) return;
    await writeChunk(stream, deferredEpilogue(deferred.table, deferred.keyColumns, deferred.column));
    await closeStream();
    deferred = null;
  };

  return {
    dialect: Dialect.Postgres,

    async beginTable(table) {
      await prepare();
      const name = tableFileName(files.length, table);
      files.push(name);
      tables.push(table);
      stream = createWriteStream(join(directory, name));
      await writeChunk(stream, tablePrologue(table, triggerHandling));
    },

    async writeRows(table, rows) {
      await writeChunk(stream, copyRows(table, rows));
    },

    async endTable() {
      await writeChunk(stream, TABLE_EPILOGUE);
      await closeStream();
    },

    async writeDeferredUpdates(table, updates) {
      const column = deferredColumnOf(table, updates);
      const keyColumns = keyColumnsOf(table);
      if (deferred?.column !== column) {
        await closeDeferred();
        const name = deferredFileName(files.length, table, column);
        files.push(name);
        stream = createWriteStream(join(directory, name));
        deferred = { column, keyColumns, table };
        await writeChunk(stream, deferredPrologue(table, keyColumns, column, triggerHandling));
      }
      await writeChunk(stream, deferredRows(table, keyColumns, column, updates));
    },

    async end(report) {
      await closeDeferred();
      const written = [...files, FINALISE_FILE];
      await writeFile(join(directory, FINALISE_FILE), finaliseScript(tables));
      await writeFile(join(directory, ORCHESTRATOR_FILE), orchestrator(written));
      await writeFile(
        join(directory, MANIFEST_FILE),
        manifest({ report, triggerHandling, files: written, generatedAt: new Date().toISOString() }),
      );
      return report;
    },
  };
};

module.exports = { createPostgresSqlFileSink };
