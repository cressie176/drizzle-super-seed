const { once } = require('node:events');
const { serialiseCopyRow } = require('./copy-text-serialisation');

const TriggerHandling = Object.freeze({
  DisableDuringLoad: 'DisableDuringLoad',
  LeaveEnabled: 'LeaveEnabled',
});

const DEFAULT_SCHEMA = 'public';

const quoted = (name) => `"${name}"`;

const qualified = (table) => `${quoted(table.schemaName ?? DEFAULT_SCHEMA)}.${quoted(table.name)}`;

const columnList = (table) => table.columns.map((column) => quoted(column.name)).join(', ');

const replicationRole = {
  [TriggerHandling.DisableDuringLoad]: 'SET session_replication_role = replica;\n',
  [TriggerHandling.LeaveEnabled]: '',
};

const tablePrologue = (table, triggerHandling) =>
  `BEGIN;\n${replicationRole[triggerHandling]}COPY ${qualified(table)} (${columnList(table)}) FROM stdin;\n`;

const TABLE_EPILOGUE = '\\.\nCOMMIT;\n';

const copyRows = (table, rows) => rows.map((row) => serialiseCopyRow(table.columns, row, table.key)).join('');

const sequenceColumns = (table) => table.columns.filter((column) => column.sequenceOwned);

const setval = (table, column) =>
  [
    `SELECT setval(pg_get_serial_sequence('${qualified(table)}', '${column.name}'),`,
    `(SELECT COALESCE(MAX(${quoted(column.name)}), 1) FROM ${qualified(table)}));\n`,
  ].join(' ');

const setvals = (tables) =>
  tables.flatMap((table) => sequenceColumns(table).map((column) => setval(table, column))).join('');

const finaliseScript = (tables) => `BEGIN;\n${setvals(tables)}COMMIT;\nANALYZE;\n`;

const writeChunk = (writable, chunk) => (writable.write(chunk) ? undefined : once(writable, 'drain'));

module.exports = { TABLE_EPILOGUE, TriggerHandling, copyRows, finaliseScript, tablePrologue, writeChunk };
