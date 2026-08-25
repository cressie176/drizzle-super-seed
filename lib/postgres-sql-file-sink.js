const { once } = require('node:events');
const { createWriteStream } = require('node:fs');
const { mkdir, readdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { OutputDirectoryNotEmptyError } = require('./generation-errors');
const {
  TABLE_EPILOGUE,
  TriggerHandling,
  copyRows,
  finaliseScript,
  tablePrologue,
  writeChunk,
} = require('./postgres-copy-script');

const NUMBER_STEP = 10;
const NUMBER_WIDTH = 3;
const FINALISE_FILE = '900_finalise.sql';
const ORCHESTRATOR_FILE = 'load.psql';
const MANIFEST_FILE = 'manifest.json';
const INDENT = 2;

const fileNumber = (index) => String((index + 1) * NUMBER_STEP).padStart(NUMBER_WIDTH, '0');

const tableFileName = (index, table) => `${fileNumber(index)}_${table.key}.sql`;

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

  const prepare = () => {
    prepared = prepared ?? requireEmptyDirectory(directory);
    return prepared;
  };

  return {
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
      stream.end();
      await once(stream, 'close');
    },

    async end(report) {
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
