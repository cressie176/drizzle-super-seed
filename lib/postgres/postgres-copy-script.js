const { once } = require('node:events');
const { ColumnKind } = require('../canonical-schema');
const { serialiseCopyRow } = require('./copy-text-serialisation');

const TriggerHandling = Object.freeze({
  DisableDuringLoad: 'DisableDuringLoad',
  LeaveEnabled: 'LeaveEnabled',
});

const TableLogging = Object.freeze({
  SetUnlogged: 'SetUnlogged',
  LeaveLogged: 'LeaveLogged',
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

// PostgreSQL forbids a logged/unlogged pair on either side of a foreign key, so in a reference
// cycle no member can be altered first, in any order, transaction or not. Cycle members stay
// logged, and so must every table they transitively reference, or the survivors' logged foreign
// keys would block their parents' ALTERs. The engine already found the cycles: the deferred
// foreign keys are their broken edges.
const keptLoggedKeys = (orderedTables, deferredForeignKeys) => {
  const byKey = new Map(orderedTables.map((table) => [table.key, table]));
  // A deferred edge names only its owning table and column; the other end comes from the
  // owning table's own foreign key declaration.
  const referencedBy = (edge) =>
    byKey.get(edge.tableKey).foreignKeys.find((foreignKey) => foreignKey.columnName === edge.columnName)
      .referencedTableKey;
  const kept = new Set(deferredForeignKeys.flatMap((edge) => [edge.tableKey, referencedBy(edge)]));
  for (const key of kept) {
    for (const foreignKey of byKey.get(key).foreignKeys) kept.add(foreignKey.referencedTableKey);
  }
  return kept;
};

const keptLoggedComment = (keptKeys) =>
  keptKeys.size === 0
    ? ''
    : [
        `-- ${[...keptKeys].join(', ')} stay logged: a reference cycle cannot be made unlogged one`,
        '-- table at a time, and every table a cycle references must match it.',
        '',
      ].join('\n');

const UNLOGGED_PREAMBLE = [
  '-- Every table of the schema becomes UNLOGGED before any data loads: no WAL, the fastest',
  '-- load, and the right trade for a disposable database. Children are altered before parents,',
  '-- because PostgreSQL refuses to make a table unlogged while a logged table still references',
  '-- it. If this file fails with SQLSTATE 42P16 ("could not change table ... to unlogged',
  '-- because it references logged table ..."), a logged table outside this schema references a',
  '-- generated one: pass tableLogging: TableLogging.LeaveLogged to keep every table logged.',
  '',
].join('\n');

// Reverse dependency order, so every referencing table goes unlogged before the table it points
// at. Covers the whole schema, counted or not: an uncounted table created by the same DDL would
// otherwise stay logged and fail its parent's ALTER.
const setUnloggedScript = (orderedTables, deferredForeignKeys) => {
  const kept = keptLoggedKeys(orderedTables, deferredForeignKeys);
  const alterable = orderedTables.filter((table) => !kept.has(table.key));
  if (alterable.length === 0) return '';
  return `${UNLOGGED_PREAMBLE}${keptLoggedComment(kept)}${[...alterable]
    .reverse()
    .map((table) => `ALTER TABLE ${qualified(table)} SET UNLOGGED;\n`)
    .join('')}`;
};

module.exports = {
  TABLE_EPILOGUE,
  TableLogging,
  TriggerHandling,
  copyRows,
  deferredEpilogue,
  deferredPrologue,
  deferredRows,
  deferredTableName,
  finaliseScript,
  setUnloggedScript,
  tablePrologue,
  writeChunk,
};
