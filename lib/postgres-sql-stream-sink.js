const {
  TABLE_EPILOGUE,
  TriggerHandling,
  copyRows,
  finaliseScript,
  tablePrologue,
  writeChunk,
} = require('./postgres-copy-script');

const createPostgresSqlStreamSink = ({ writable, triggerHandling = TriggerHandling.DisableDuringLoad }) => {
  const tables = [];

  return {
    async beginTable(table) {
      tables.push(table);
      await writeChunk(writable, tablePrologue(table, triggerHandling));
    },

    async writeRows(table, rows) {
      await writeChunk(writable, copyRows(table, rows));
    },

    async endTable() {
      await writeChunk(writable, TABLE_EPILOGUE);
    },

    async end(report) {
      await writeChunk(writable, finaliseScript(tables));
      return report;
    },
  };
};

module.exports = { createPostgresSqlStreamSink };
