const { once } = require('node:events');
const { createWriteStream } = require('node:fs');
const { mkdir, readdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { OutputDirectoryNotEmptyError, TooManyOutputFilesError } = require('../generation-errors');
const { contentHashOf } = require('../output-content-hash');
const { serialiseCsvHeader, serialiseCsvRow } = require('./csv-serialisation');
const { orderTablesByDependency } = require('../table-dependency-order');
const {
  DEFAULT_FILE_PREFIX,
  FIRST_NUMBER,
  LAST_NUMBER,
  NUMBER_STEP,
  numberedName,
  requireWritablePrefix,
} = require('../output-file-names');

const MANIFEST_FILE = 'manifest.json';
const INDENT = 2;
const DEFAULT_NULL_TOKEN = '';

// No finalise file claims a number here, so the sequence runs to the last slot.
const MAX_NUMBERED_FILES = (LAST_NUMBER - FIRST_NUMBER) / NUMBER_STEP + 1;

const requireRoomForAnotherFile = (index, table) => {
  if (index < MAX_NUMBERED_FILES) return;
  throw new TooManyOutputFilesError({ limit: MAX_NUMBERED_FILES, table: table.key });
};

const tableFileName = (prefix, index, table) => `${numberedName(prefix, index)}_${table.key}.csv`;

// Nothing volatile belongs here: see the note in the PostgreSQL sink.
const manifest = ({ report, files, header, nullToken, contentHash }) =>
  `${JSON.stringify(
    {
      seed: report.seed,
      referenceDate: report.referenceDate.toISOString(),
      rowCounts: report.rowCounts,
      header,
      nullToken,
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

const writeChunk = (writable, chunk) => (writable.write(chunk) ? undefined : once(writable, 'drain'));

const indexKey = (value) => `${typeof value}:${value}`;

const matches = (row, primaryKey) =>
  Object.entries(primaryKey).every(([property, value]) => indexKey(row[property]) === indexKey(value));

const applyDeferredUpdates = (rows, updates) => {
  for (const update of updates) {
    Object.assign(
      rows.find((row) => matches(row, update.primaryKey)),
      update.values,
    );
  }
};

// One RFC 4180 file per table, numbered so lexical order is dependency order. No orchestrator
// and no finalise file: there is no universal CSV loader to script, and nothing to finalise.
// The sink declares no dialect, so any schema may use it.
//
// A CSV file cannot express the deferred pass's UPDATE, so a table owning a deferred foreign
// key is not streamed: its rows are held in memory, patched in place when the pass delivers,
// and written once at the end with the final values only. Every other table streams; the
// memory cost is bounded to the cyclic tables alone.
const createCsvFileSink = ({
  directory,
  header = true,
  nullToken = DEFAULT_NULL_TOKEN,
  filePrefix = DEFAULT_FILE_PREFIX,
}) => {
  requireWritablePrefix(filePrefix);
  const files = [];
  const buffers = new Map();
  let deferredOwners = new Set();
  let prepared = null;
  let stream = null;

  const prepareDirectory = () => {
    prepared = prepared ?? requireEmptyDirectory(directory);
    return prepared;
  };

  const writeBufferedTable = async ({ table, name, rows }) => {
    const content = rows.map((row) => serialiseCsvRow(table.columns, row, table.key, { nullToken }));
    if (header) content.unshift(serialiseCsvHeader(table.columns));
    await writeFile(join(directory, name), content.join(''));
  };

  return {
    prepare(schema) {
      deferredOwners = new Set(orderTablesByDependency(schema).deferredForeignKeys.map((edge) => edge.tableKey));
    },

    async beginTable(table) {
      await prepareDirectory();
      requireRoomForAnotherFile(files.length, table);
      const name = tableFileName(filePrefix, files.length, table);
      files.push(name);
      if (deferredOwners.has(table.key)) {
        buffers.set(table.key, { table, name, rows: [] });
        stream = null;
        return;
      }
      stream = createWriteStream(join(directory, name));
      if (header) await writeChunk(stream, serialiseCsvHeader(table.columns));
    },

    async writeRows(table, rows) {
      const buffered = buffers.get(table.key);
      if (buffered) {
        buffered.rows.push(...rows);
        return;
      }
      for (const row of rows) {
        await writeChunk(stream, serialiseCsvRow(table.columns, row, table.key, { nullToken }));
      }
    },

    async endTable(table) {
      if (buffers.has(table.key)) return;
      stream.end();
      await once(stream, 'close');
    },

    writeDeferredUpdates(table, updates) {
      applyDeferredUpdates(buffers.get(table.key).rows, updates);
    },

    async end(report) {
      await prepareDirectory();
      for (const buffered of buffers.values()) await writeBufferedTable(buffered);
      const contentHash = await contentHashOf(directory, files);
      await writeFile(join(directory, MANIFEST_FILE), manifest({ report, files, header, nullToken, contentHash }));
      return report;
    },
  };
};

module.exports = { createCsvFileSink };
