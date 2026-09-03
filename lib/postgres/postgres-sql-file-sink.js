const { once } = require('node:events');
const { createWriteStream } = require('node:fs');
const { mkdir, readdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { OutputDirectoryNotEmptyError, TooManyOutputFilesError } = require('../generation-errors');
const {
  SCRIPT_PROLOGUE,
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
const { contentHashOf } = require('../output-content-hash');
const { orderTablesByDependency } = require('../table-dependency-order');
const {
  DEFAULT_FILE_PREFIX,
  FIRST_NUMBER,
  LAST_NUMBER,
  NUMBER_STEP,
  numberedName,
  requireWritablePrefix,
  reservedName,
} = require('../output-file-names');

const ORCHESTRATOR_FILE = 'load.psql';
const MANIFEST_FILE = 'manifest.json';
const INDENT = 2;

// The unlogged file takes the first slot and the finalise file the last, so table and deferred
// files share everything between them.
const MAX_NUMBERED_FILES = (LAST_NUMBER - FIRST_NUMBER) / NUMBER_STEP;

const unloggedFileName = (prefix) => `${reservedName(prefix, 0)}_set_unlogged.sql`;

const finaliseFileName = (prefix) => `${reservedName(prefix, LAST_NUMBER)}_finalise.sql`;

const requireRoomForAnotherFile = (index, table) => {
  if (index < MAX_NUMBERED_FILES) return;
  throw new TooManyOutputFilesError({ limit: MAX_NUMBERED_FILES, table: table.key });
};

const tableFileName = (prefix, index, table) => `${numberedName(prefix, index)}_${table.key}.sql`;

const deferredFileName = (prefix, index, table, column) =>
  `${numberedName(prefix, index)}_deferred_${table.name}_${column.name}.sql`;

const keyColumnsOf = (table) => table.primaryKey.map((name) => table.columns.find((column) => column.name === name));

const deferredColumnOf = (table, updates) => {
  const [propertyName] = Object.keys(updates[0].values);
  return table.columns.find((column) => column.propertyName === propertyName);
};

const orchestrator = (files) => `\\set ON_ERROR_STOP on\n${files.map((file) => `\\ir ${file}\n`).join('')}`;

// Nothing volatile belongs here: the manifest is a pure function of the inputs, so an
// unchanged run rewrites it byte for byte and the whole directory content-addresses. Wall
// clock time and duration live on the returned report instead.
const manifest = ({ report, triggerHandling, tableLogging, files, contentHash }) =>
  `${JSON.stringify(
    {
      seed: report.seed,
      referenceDate: report.referenceDate.toISOString(),
      rowCounts: report.rowCounts,
      triggerHandling,
      tableLogging,
      files,
      contentHash,
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
  filePrefix = DEFAULT_FILE_PREFIX,
}) => {
  requireWritablePrefix(filePrefix);
  const unloggedFile = unloggedFileName(filePrefix);
  const finaliseFile = finaliseFileName(filePrefix);
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
      const name = tableFileName(filePrefix, files.length, table);
      files.push(name);
      tables.push(table);
      stream = createWriteStream(join(directory, name));
      await writeChunk(stream, SCRIPT_PROLOGUE);
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
        const name = deferredFileName(filePrefix, files.length, table, column);
        files.push(name);
        stream = createWriteStream(join(directory, name));
        deferred = { column, keyColumns, table };
        await writeChunk(stream, SCRIPT_PROLOGUE);
        await writeChunk(stream, deferredPrologue(table, keyColumns, column, triggerHandling));
      }
      await writeChunk(stream, deferredRows(table, keyColumns, column, updates));
    },

    async end(report) {
      await closeDeferred();
      await prepareDirectory();
      const written = [...(unloggedScript ? [unloggedFile] : []), ...files, finaliseFile];
      if (unloggedScript) await writeFile(join(directory, unloggedFile), `${SCRIPT_PROLOGUE}${unloggedScript}`);
      await writeFile(join(directory, finaliseFile), `${SCRIPT_PROLOGUE}${finaliseScript(tables)}`);
      await writeFile(join(directory, ORCHESTRATOR_FILE), orchestrator(written));
      const contentHash = await contentHashOf(directory, written);
      await writeFile(
        join(directory, MANIFEST_FILE),
        manifest({ report, triggerHandling, tableLogging, files: written, contentHash }),
      );
      return report;
    },
  };
};

module.exports = { createPostgresSqlFileSink };
