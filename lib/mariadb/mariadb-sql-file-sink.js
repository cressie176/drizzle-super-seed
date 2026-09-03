const { once } = require('node:events');
const { createWriteStream } = require('node:fs');
const { mkdir, readdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { Dialect } = require('../canonical-schema');
const { OutputDirectoryNotEmptyError, TooManyOutputFilesError } = require('../generation-errors');
const { contentHashOf } = require('../output-content-hash');
const { quotedIdentifier, serialiseInsertRow } = require('./mariadb-literal-serialisation');
const {
  DEFAULT_FILE_PREFIX,
  FIRST_NUMBER,
  LAST_NUMBER,
  NUMBER_STEP,
  numberedName,
  requireWritablePrefix,
  reservedName,
} = require('../output-file-names');

const ORCHESTRATOR_FILE = 'load.mysql';
const MANIFEST_FILE = 'manifest.json';
const INDENT = 2;
const DEFAULT_ROWS_PER_STATEMENT = 1000;

const MAX_NUMBERED_FILES = (LAST_NUMBER - FIRST_NUMBER) / NUMBER_STEP;

const finaliseFileName = (prefix) => `${reservedName(prefix, LAST_NUMBER)}_finalise.sql`;

// Numbers are five digits starting at 10000, so every file sorts after any 0NNN_-prefixed
// drizzle-kit migration sharing the directory, and (index * 10) reaches the finalise file's
// own number at the ceiling, where the guard refuses rather than sorting past the finaliser.
const requireRoomForAnotherFile = (index, table) => {
  if (index < MAX_NUMBERED_FILES) return;
  throw new TooManyOutputFilesError({ limit: MAX_NUMBERED_FILES, table: table.key });
};

const tableFileName = (prefix, index, table) => `${numberedName(prefix, index)}_${table.key}.sql`;

const columnList = (table) => table.columns.map((column) => quotedIdentifier(column.name)).join(', ');

const insertHeader = (table) => `INSERT INTO ${quotedIdentifier(table.name)} (${columnList(table)}) VALUES\n`;

// No superuser privilege is needed for either setting, so §3.16 gives this sink no TriggerHandling.
const tablePrologue = (table) =>
  ['START TRANSACTION;\n', 'SET foreign_key_checks = 0;\n', 'SET unique_checks = 0;\n', insertHeader(table)].join('');

const TABLE_EPILOGUE = ';\nCOMMIT;\n';

const EMPTY_TABLE_FILE = 'START TRANSACTION;\nCOMMIT;\n';

const analyse = (table) => `ANALYZE TABLE ${quotedIdentifier(table.name)};\n`;

// InnoDB advances AUTO_INCREMENT past explicitly inserted ids, so there is no sequence fix-up.
const finaliseScript = (tables) => tables.map(analyse).join('');

const orchestrator = (files) => files.map((file) => `source ${file};\n`).join('');

// Nothing volatile belongs here: see the note in the PostgreSQL sink.
const manifest = ({ report, files, rowsPerStatement, contentHash }) =>
  `${JSON.stringify(
    {
      seed: report.seed,
      referenceDate: report.referenceDate.toISOString(),
      rowCounts: report.rowCounts,
      rowsPerStatement,
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

const createMariaDbSqlFileSink = ({
  directory,
  rowsPerStatement = DEFAULT_ROWS_PER_STATEMENT,
  filePrefix = DEFAULT_FILE_PREFIX,
}) => {
  requireWritablePrefix(filePrefix);
  const finaliseFile = finaliseFileName(filePrefix);
  const tables = [];
  const files = [];
  let prepared = null;
  let stream = null;
  let written = 0;

  const prepare = () => {
    prepared = prepared ?? requireEmptyDirectory(directory);
    return prepared;
  };

  // Rows are chunked into extended INSERTs independently of the engine's batchSize, so a large
  // batch becomes several statements and a small one continues the statement already open.
  const opening = (table) => {
    if (written === 0) return tablePrologue(table);
    if (written % rowsPerStatement === 0) return `;\n${insertHeader(table)}`;
    return ',\n';
  };

  return {
    dialect: Dialect.MariaDb,

    async beginTable(table) {
      await prepare();
      requireRoomForAnotherFile(files.length, table);
      const name = tableFileName(filePrefix, files.length, table);
      files.push(name);
      tables.push(table);
      written = 0;
      stream = createWriteStream(join(directory, name));
    },

    async writeRows(table, rows) {
      for (const row of rows) {
        await writeChunk(stream, `${opening(table)}${serialiseInsertRow(table.key, table.columns, row)}`);
        written += 1;
      }
    },

    async endTable() {
      await writeChunk(stream, written === 0 ? EMPTY_TABLE_FILE : TABLE_EPILOGUE);
      stream.end();
      await once(stream, 'close');
    },

    async end(report) {
      const all = [...files, finaliseFile];
      await writeFile(join(directory, finaliseFile), finaliseScript(tables));
      await writeFile(join(directory, ORCHESTRATOR_FILE), orchestrator(all));
      const contentHash = await contentHashOf(directory, all);
      await writeFile(join(directory, MANIFEST_FILE), manifest({ report, files: all, rowsPerStatement, contentHash }));
      return report;
    },
  };
};

module.exports = { createMariaDbSqlFileSink };
