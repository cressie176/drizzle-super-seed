const { once } = require('node:events');
const { ColumnKind } = require('../canonical-schema');
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

const bounded = (bound, unbounded) => (column) => (column.maxLength === undefined ? unbounded : bound(column));

const temporaryTypes = new Map([
  [ColumnKind.Integer, () => 'integer'],
  [ColumnKind.BigInt, () => 'bigint'],
  [ColumnKind.Decimal, () => 'numeric'],
  [ColumnKind.Real, () => 'double precision'],
  [ColumnKind.Text, bounded((column) => `varchar(${column.maxLength})`, 'text')],
  [ColumnKind.Boolean, () => 'boolean'],
  [ColumnKind.Uuid, () => 'uuid'],
  [ColumnKind.Date, () => 'date'],
  [ColumnKind.Timestamp, (column) => (column.withTimezone ? 'timestamptz' : 'timestamp')],
  [ColumnKind.Time, () => 'time'],
  [ColumnKind.Json, () => 'jsonb'],
  [ColumnKind.Enum, () => 'text'],
]);

const temporaryColumn = (column) => `${quoted(column.name)} ${temporaryTypes.get(column.kind)(column)}`;

const deferredTableName = (table, column) => `deferred_${table.name}_${column.name}`;

const assignment = (column) => `${quoted(column.name)} = d.${quoted(column.name)}`;

const matchOn = (columns) =>
  columns.map((column) => `t.${quoted(column.name)} = d.${quoted(column.name)}`).join(' AND ');

const deferredPrologue = (table, keyColumns, column, triggerHandling) => {
  const name = deferredTableName(table, column);
  const columns = [...keyColumns, column];
  return [
    'BEGIN;\n',
    replicationRole[triggerHandling],
    `CREATE TEMP TABLE ${name} (${columns.map(temporaryColumn).join(', ')}) ON COMMIT DROP;\n`,
    `COPY ${name} (${columns.map((each) => quoted(each.name)).join(', ')}) FROM stdin;\n`,
  ].join('');
};

const deferredEpilogue = (table, keyColumns, column) =>
  [
    '\\.\n',
    `UPDATE ${qualified(table)} AS t SET ${assignment(column)}`,
    ` FROM ${deferredTableName(table, column)} d WHERE ${matchOn(keyColumns)};\n`,
    'COMMIT;\n',
  ].join('');

const deferredRows = (table, keyColumns, column, updates) =>
  updates
    .map((update) => serialiseCopyRow([...keyColumns, column], { ...update.primaryKey, ...update.values }, table.key))
    .join('');

const writeChunk = (writable, chunk) => (writable.write(chunk) ? undefined : once(writable, 'drain'));

module.exports = {
  TABLE_EPILOGUE,
  TriggerHandling,
  copyRows,
  deferredEpilogue,
  deferredPrologue,
  deferredRows,
  deferredTableName,
  finaliseScript,
  tablePrologue,
  writeChunk,
};
