const { once } = require('node:events');
const { createWriteStream } = require('node:fs');
const { mkdir, readdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { OutputDirectoryNotEmptyError, TooManyOutputFilesError } = require('../generation-errors');
const {
  TABLE_EPILOGUE,
  TableLogging,
  TriggerHandling,
  copyRows,
  deferredEpilogue,
  deferredPrologue,
  deferredRows,
  finaliseScript,
  setUnloggedScript,
  tablePrologue,
  writeChunk,
} = require('./postgres-copy-script');
const { Dialect } = require('../canonical-schema');
const { orderTablesByDependency } = require('../table-dependency-order');

const NUMBER_STEP = 10;
const NUMBER_WIDTH = 4;
const UNLOGGED_FILE = '0001_set_unlogged.sql';
const FINALISE_FILE = '9000_finalise.sql';
const ORCHESTRATOR_FILE = 'load.psql';
const MANIFEST_FILE = 'manifest.json';
const INDENT = 2;

const MAX_NUMBERED_FILES = Number(FINALISE_FILE.slice(0, NUMBER_WIDTH)) / NUMBER_STEP - 1;

const fileNumber = (index) => String((index + 1) * NUMBER_STEP).padStart(NUMBER_WIDTH, '0');

// Numbering is (index + 1) * 10 zero-padded to four digits, so the 900th file would be 9000_,
// the finalise file's own number, and the 901st would sort after it and load past the finaliser.
const requireRoomForAnotherFile = (index, table) => {
  if (index < MAX_NUMBERED_FILES) return;
  throw new TooManyOutputFilesError({ limit: MAX_NUMBERED_FILES, table: table.key });
};

const tableFileName = (index, table) => `${fileNumber(index)}_${table.key}.sql`;

const deferredFileName = (index, table, column) => `${fileNumber(index)}_deferred_${table.name}_${column.name}.sql`;

const keyColumnsOf = (table) => table.primaryKey.map((name) => table.columns.find((column) => column.name === name));

const deferredColumnOf = (table, updates) => {
  const [propertyName] = Object.keys(updates[0].values);
  return table.columns.find((column) => column.propertyName === propertyName);
};

const orchestrator = (files) => `\\set ON_ERROR_STOP on\n${files.map((file) => `\\ir ${file}\n`).join('')}`;

const manifest = ({ report, triggerHandling, tableLogging, files, generatedAt }) =>
  `${JSON.stringify(
    {
      seed: report.seed,
      referenceDate: report.referenceDate.toISOString(),
      rowCounts: report.rowCounts,
      durationMs: report.durationMs,
      generatedAt,
      triggerHandling,
      tableLogging,
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

const createPostgresSqlFileSink = ({
  directory,
  triggerHandling = TriggerHandling.DisableDuringLoad,
  tableLogging = TableLogging.SetUnlogged,
}) => {
  const tables = [];
  const files = [];
  let unloggedScript = '';
  let prepared = null;
  let stream = null;
  let deferred = null;

  const prepareDirectory = () => {
    prepared = prepared ?? requireEmptyDirectory(directory);
    return prepared;
  };

  const setUnlogged = tableLogging === TableLogging.SetUnlogged;

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

    prepare(schema) {
      const { tables: ordered, deferredForeignKeys } = orderTablesByDependency(schema);
      unloggedScript = setUnlogged ? setUnloggedScript(ordered, deferredForeignKeys) : '';
    },

    async beginTable(table) {
      await prepareDirectory();
      requireRoomForAnotherFile(files.length, table);
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
        requireRoomForAnotherFile(files.length, table);
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
      await prepareDirectory();
      const written = [...(unloggedScript ? [UNLOGGED_FILE] : []), ...files, FINALISE_FILE];
      if (unloggedScript) await writeFile(join(directory, UNLOGGED_FILE), unloggedScript);
      await writeFile(join(directory, FINALISE_FILE), finaliseScript(tables));
      await writeFile(join(directory, ORCHESTRATOR_FILE), orchestrator(written));
      await writeFile(
        join(directory, MANIFEST_FILE),
        manifest({ report, triggerHandling, tableLogging, files: written, generatedAt: new Date().toISOString() }),
      );
      return report;
    },
  };
};

module.exports = { createPostgresSqlFileSink };
