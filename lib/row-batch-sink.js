const overridesSystemValue = (table) => table.columns.some((column) => column.identityAlways);

const rowBatch = (table, rows) => ({
  tableKey: table.key,
  table: table.drizzleTable,
  rows,
  overrideSystemValue: overridesSystemValue(table),
});

const deferredUpdateBatch = (table, updates) => ({
  tableKey: table.key,
  table: table.drizzleTable,
  columnNames: Object.keys(updates[0].values),
  updates,
});

// The sink omits writeDeferredUpdates entirely without a handler, so a cyclic schema fails at
// validation time rather than silently losing the deferred pass (§3.13).
const deferredUpdates = (deferredUpdateHandler) =>
  deferredUpdateHandler
    ? {
        writeDeferredUpdates(table, updates) {
          return deferredUpdateHandler(deferredUpdateBatch(table, updates));
        },
      }
    : {};

const createRowBatchSink = (handler, deferredUpdateHandler) => ({
  writeRows(table, rows) {
    return handler(rowBatch(table, rows));
  },
  ...deferredUpdates(deferredUpdateHandler),
  end(report) {
    return report;
  },
});

module.exports = { createRowBatchSink };
