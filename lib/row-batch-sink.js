const overridesSystemValue = (table) => table.columns.some((column) => column.identityAlways);

const rowBatch = (table, rows) => ({
  tableKey: table.key,
  table: table.drizzleTable,
  rows,
  overrideSystemValue: overridesSystemValue(table),
});

const createRowBatchSink = (handler) => ({
  writeRows(table, rows) {
    return handler(rowBatch(table, rows));
  },
  end(report) {
    return report;
  },
});

module.exports = { createRowBatchSink };
