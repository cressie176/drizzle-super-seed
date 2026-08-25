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

const keyColumnsOf = (table) => table.primaryKey.map((name) => table.columns.find((column) => column.name === name));

const deferredColumnOf = (table, updates) => {
  const [propertyName] = Object.keys(updates[0].values);
  return table.columns.find((column) => column.propertyName === propertyName);
};

const createPostgresSqlStreamSink = ({ writable, triggerHandling = TriggerHandling.DisableDuringLoad }) => {
  const tables = [];
  let deferred = null;

  const closeDeferred = async () => {
    if (!deferred) return;
    await writeChunk(writable, deferredEpilogue(deferred.table, deferred.keyColumns, deferred.column));
    deferred = null;
  };

  return {
    dialect: Dialect.Postgres,

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

    async writeDeferredUpdates(table, updates) {
      const column = deferredColumnOf(table, updates);
      const keyColumns = keyColumnsOf(table);
      if (deferred?.column !== column) {
        await closeDeferred();
        deferred = { column, keyColumns, table };
        await writeChunk(writable, deferredPrologue(table, keyColumns, column, triggerHandling));
      }
      await writeChunk(writable, deferredRows(table, keyColumns, column, updates));
    },

    async end(report) {
      await closeDeferred();
      await writeChunk(writable, finaliseScript(tables));
      return report;
    },
  };
};

module.exports = { createPostgresSqlStreamSink };
