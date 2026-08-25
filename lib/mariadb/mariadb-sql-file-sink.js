const { once } = require('node:events');
const { createWriteStream } = require('node:fs');
const { mkdir, readdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { Dialect } = require('../canonical-schema');
const { OutputDirectoryNotEmptyError, TooManyOutputFilesError } = require('../generation-errors');
const { quotedIdentifier, serialiseInsertRow } = require('./mariadb-literal-serialisation');

const NUMBER_STEP = 10;
const NUMBER_WIDTH = 3;
const FINALISE_FILE = '900_finalise.sql';
const ORCHESTRATOR_FILE = 'load.mysql';
const MANIFEST_FILE = 'manifest.json';
const INDENT = 2;
const DEFAULT_ROWS_PER_STATEMENT = 1000;

const MAX_NUMBERED_FILES = Number(FINALISE_FILE.slice(0, NUMBER_WIDTH)) / NUMBER_STEP - 1;

const fileNumber = (index) => String((index + 1) * NUMBER_STEP).padStart(NUMBER_WIDTH, '0');

// Numbering is (index + 1) * 10 zero-padded to three digits, so the 90th file would be 900_ —
// the finalise file's own number — and the 91st would sort after it and load past ANALYZE.
const requireRoomForAnotherFile = (index, table) => {
  if (index < MAX_NUMBERED_FILES) return;
  throw new TooManyOutputFilesError({ limit: MAX_NUMBERED_FILES, table: table.key });
};

const tableFileName = (index, table) => `${fileNumber(index)}_${table.key}.sql`;

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

const manifest = ({ report, files, generatedAt, rowsPerStatement }) =>
  `${JSON.stringify(
    {
      seed: report.seed,
      referenceDate: report.referenceDate.toISOString(),
      rowCounts: report.rowCounts,
      durationMs: report.durationMs,
      generatedAt,
      rowsPerStatement,
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

const createMariaDbSqlFileSink = ({ directory, rowsPerStatement = DEFAULT_ROWS_PER_STATEMENT }) => {
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
      const name = tableFileName(files.length, table);
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
      const all = [...files, FINALISE_FILE];
      await writeFile(join(directory, FINALISE_FILE), finaliseScript(tables));
      await writeFile(join(directory, ORCHESTRATOR_FILE), orchestrator(all));
      await writeFile(
        join(directory, MANIFEST_FILE),
        manifest({ report, files: all, generatedAt: new Date().toISOString(), rowsPerStatement }),
      );
      return report;
    },
  };
};

module.exports = { createMariaDbSqlFileSink };
