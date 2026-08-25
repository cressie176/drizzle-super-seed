const createRecordingSink = () => {
  const calls = [];
  const batches = [];
  const rowsByTable = new Map();

  const record = (rows, table) => {
    const recorded = rowsByTable.get(table.key) ?? [];
    rowsByTable.set(table.key, [...recorded, ...rows]);
  };

  return {
    beginTable(table) {
      calls.push(`beginTable ${table.key}`);
    },
    writeRows(table, rows) {
      calls.push(`writeRows ${table.key} ${rows.length}`);
      batches.push({ tableKey: table.key, rows });
      record(rows, table);
    },
    endTable(table) {
      calls.push(`endTable ${table.key}`);
    },
    end(report) {
      calls.push('end');
      return { batches, calls, report, rowsByTable };
    },
  };
};

const rowsOf = (result, tableKey) => result.rowsByTable.get(tableKey) ?? [];

const valuesOf = (result, tableKey, propertyName) => rowsOf(result, tableKey).map((row) => row[propertyName]);

module.exports = { createRecordingSink, rowsOf, valuesOf };
