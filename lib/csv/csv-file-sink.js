const { once } = require('node:events');
const { createWriteStream } = require('node:fs');
const { mkdir, readdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { OutputDirectoryNotEmptyError, TooManyOutputFilesError } = require('../generation-errors');
const { serialiseCsvHeader, serialiseCsvRow } = require('./csv-serialisation');

const NUMBER_STEP = 10;
const NUMBER_WIDTH = 4;
const MANIFEST_FILE = 'manifest.json';
const INDENT = 2;
const DEFAULT_NULL_TOKEN = '';

// No finalise file claims a number here, so the sequence runs to the last four-digit slot.
const MAX_NUMBERED_FILES = 999;

const fileNumber = (index) => String((index + 1) * NUMBER_STEP).padStart(NUMBER_WIDTH, '0');

const requireRoomForAnotherFile = (index, table) => {
  if (index < MAX_NUMBERED_FILES) return;
  throw new TooManyOutputFilesError({ limit: MAX_NUMBERED_FILES, table: table.key });
};

const tableFileName = (index, table) => `${fileNumber(index)}_${table.key}.csv`;

const manifest = ({ report, files, generatedAt, header, nullToken }) =>
  `${JSON.stringify(
    {
      seed: report.seed,
      referenceDate: report.referenceDate.toISOString(),
      rowCounts: report.rowCounts,
      durationMs: report.durationMs,
      generatedAt,
      header,
      nullToken,
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

const writeChunk = (writable, chunk) => (writable.write(chunk) ? undefined : once(writable, 'drain'));

// One RFC 4180 file per table, numbered so lexical order is dependency order. No orchestrator
// and no finalise file: there is no universal CSV loader to script, and nothing to finalise.
// The sink declares no dialect, so any schema may use it.
const createCsvFileSink = ({ directory, header = true, nullToken = DEFAULT_NULL_TOKEN }) => {
  const files = [];
  let prepared = null;
  let stream = null;

  const prepareDirectory = () => {
    prepared = prepared ?? requireEmptyDirectory(directory);
    return prepared;
  };

  return {
    async beginTable(table) {
      await prepareDirectory();
      requireRoomForAnotherFile(files.length, table);
      const name = tableFileName(files.length, table);
      files.push(name);
      stream = createWriteStream(join(directory, name));
      if (header) await writeChunk(stream, serialiseCsvHeader(table.columns));
    },

    async writeRows(table, rows) {
      for (const row of rows) {
        await writeChunk(stream, serialiseCsvRow(table.columns, row, table.key, { nullToken }));
      }
    },

    async endTable() {
      stream.end();
      await once(stream, 'close');
    },

    async end(report) {
      await prepareDirectory();
      await writeFile(
        join(directory, MANIFEST_FILE),
        manifest({ report, files, generatedAt: new Date().toISOString(), header, nullToken }),
      );
      return report;
    },
  };
};

module.exports = { createCsvFileSink };
