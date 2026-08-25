const { randomUUID } = require('node:crypto');
const { extractCanonicalSchema } = require('./drizzle-schema-adapter');
const { ColumnOrderError, EmptyParentPoolError, UniqueConstraintExhaustedError } = require('./generation-errors');
const { resolveGenerationPlan } = require('./generation-rules');
const { createRandomSource } = require('./random-source');
const { orderTablesByDependency } = require('./table-dependency-order');

const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_NULL_PROBABILITY = 0.1;
const MAX_UNIQUE_ATTEMPTS = 100;

const SEED_DIGITS = 8;
const HEXADECIMAL = 16;

const inventSeed = () => Number.parseInt(randomUUID().replaceAll('-', '').slice(0, SEED_DIGITS), HEXADECIMAL);

const resolveLookups = async (lookups = {}) => {
  const entries = Object.entries(lookups);
  const loaded = await Promise.all(entries.map(([, load]) => load()));
  return Object.freeze(Object.fromEntries(entries.map(([name], index) => [name, loaded[index]])));
};

const dateKey = (value) => `date:${value.toISOString()}`;

const objectKey = (value) => `object:${JSON.stringify(value)}`;

const valueKey = (value) => {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return dateKey(value);
  if (typeof value === 'object') return objectKey(value);
  return `${typeof value}:${value}`;
};

const tupleKey = (values) => JSON.stringify(values.map(valueKey));

const referencedColumnsOf = (schema) => {
  const referenced = new Map([...schema.tables.keys()].map((key) => [key, new Set()]));
  for (const table of schema.tables.values()) {
    for (const foreignKey of table.foreignKeys) {
      referenced.get(foreignKey.referencedTableKey).add(foreignKey.referencedColumnName);
    }
  }
  return referenced;
};

const emptyPools = (columnNames) => new Map([...columnNames].map((columnName) => [columnName, []]));

const retainedPools = (schema) =>
  new Map([...referencedColumnsOf(schema)].map(([key, columnNames]) => [key, emptyPools(columnNames)]));

const propertyNamesOf = (table) => new Map(table.columns.map((column) => [column.name, column.propertyName]));

const foreignKeyOf = (table, column) => table.foreignKeys.find((foreignKey) => foreignKey.columnName === column.name);

const plannedColumn = (table, entry) => {
  const foreignKey = foreignKeyOf(table, entry.column);
  return { ...entry, foreignKey, selfReferencing: foreignKey?.referencedTableKey === table.key };
};

const constraintColumnLists = (table) => [table.primaryKey, ...table.uniqueConstraints];

const alwaysUnique = (columns) => columns.every((column) => column.sequenceOwned);

const plannedConstraint = (entries, columnNames) => {
  const columns = columnNames.map((columnName) => entries.find((entry) => entry.column.name === columnName));
  return { entries: columns, columns: columns.map((entry) => entry.column), emitted: new Set() };
};

const distinctColumnLists = (columnLists) => [...new Map(columnLists.map((list) => [list.join(), list])).values()];

const plannedConstraints = (table, entries) =>
  distinctColumnLists(constraintColumnLists(table))
    .map((columnNames) => plannedConstraint(entries, columnNames))
    .filter((constraint) => !alwaysUnique(constraint.columns));

const plannedTable = (table, planEntries, count) => {
  const entries = planEntries.map((entry) => plannedColumn(table, entry));
  return {
    table,
    entries,
    count,
    constraints: plannedConstraints(table, entries),
    propertyNames: propertyNamesOf(table),
  };
};

const rowView = (table, row, cursor, run) => {
  const columnNames = new Set(table.columns.map((column) => column.propertyName));
  return new Proxy(row, {
    get(target, key) {
      if (typeof key === 'string' && columnNames.has(key) && !Object.hasOwn(target, key)) {
        throw new ColumnOrderError({ table: table.key, column: cursor.column, readColumn: key, seed: run.seed });
      }
      return Reflect.get(target, key);
    },
  });
};

const rowContext = (run, planned, row, rowIndex, cursor) => ({
  random: run.random,
  seed: run.seed,
  row: rowView(planned.table, row, cursor, run),
  rowIndex,
  lookups: run.lookups,
  referenceDate: run.referenceDate,
});

const poolOf = (run, foreignKey) => run.pools.get(foreignKey.referencedTableKey).get(foreignKey.referencedColumnName);

const absentParent = (planned, entry, run) => {
  if (!entry.column.notNull) return null;
  throw new EmptyParentPoolError({
    table: planned.table.key,
    column: entry.column.propertyName,
    parentTable: entry.foreignKey.referencedTableKey,
    seed: run.seed,
  });
};

const parentReference = (planned, entry, run) => {
  const pool = poolOf(run, entry.foreignKey);
  if (pool.length === 0) return absentParent(planned, entry, run);
  if (!entry.column.notNull && run.random.chance(DEFAULT_NULL_PROBABILITY)) return null;
  return run.random.pick(pool);
};

const priorRowContext = (context, entry, run) => ({
  ...context,
  priorSelfReferenceValues: poolOf(run, entry.foreignKey),
});

const columnValue = (planned, entry, context, run) => {
  if (entry.generator === null) return parentReference(planned, entry, run);
  if (entry.selfReferencing) return entry.generator(priorRowContext(context, entry, run));
  return entry.generator(context);
};

const writeColumns = (planned, entries, row, context, cursor, run) => {
  for (const entry of entries) {
    cursor.column = entry.column.propertyName;
    row[entry.column.propertyName] = columnValue(planned, entry, context, run);
  }
};

const constraintTuple = (constraint, row) => constraint.columns.map((column) => row[column.propertyName]);

const clashingConstraint = (planned, row) =>
  planned.constraints.find((constraint) => constraint.emitted.has(tupleKey(constraintTuple(constraint, row))));

const recordConstraints = (planned, row) => {
  for (const constraint of planned.constraints) {
    constraint.emitted.add(tupleKey(constraintTuple(constraint, row)));
  }
};

const propertyNamesIn = (constraint) => constraint.columns.map((column) => column.propertyName);

const settleConstraints = (planned, row, context, cursor, run) => {
  let clash = clashingConstraint(planned, row);
  for (let attempt = 0; clash && attempt < MAX_UNIQUE_ATTEMPTS; attempt++) {
    writeColumns(planned, clash.entries, row, context, cursor, run);
    clash = clashingConstraint(planned, row);
  }
  if (!clash) return recordConstraints(planned, row);
  throw new UniqueConstraintExhaustedError({
    table: planned.table.key,
    columns: propertyNamesIn(clash),
    attempts: MAX_UNIQUE_ATTEMPTS,
    seed: run.seed,
  });
};

const retainRow = (planned, row, run) => {
  for (const [columnName, values] of run.pools.get(planned.table.key)) {
    values.push(row[planned.propertyNames.get(columnName)]);
  }
};

const generateRow = (planned, rowIndex, run) => {
  const row = {};
  const cursor = { column: null };
  const context = rowContext(run, planned, row, rowIndex, cursor);
  writeColumns(planned, planned.entries, row, context, cursor, run);
  settleConstraints(planned, row, context, cursor, run);
  retainRow(planned, row, run);
  return row;
};

const generateTable = async (planned, run) => {
  await run.sink.beginTable?.(planned.table);
  let batch = [];
  for (let rowIndex = 0; rowIndex < planned.count; rowIndex++) {
    batch.push(generateRow(planned, rowIndex, run));
    if (batch.length < run.batchSize) continue;
    await run.sink.writeRows(planned.table, batch);
    batch = [];
  }
  if (batch.length > 0) await run.sink.writeRows(planned.table, batch);
  await run.sink.endTable?.(planned.table);
};

const countedTables = (order, plan) => order.tables.filter((table) => plan.has(table.key));

const generationReport = (run, rowCounts, startedAt) => ({
  seed: run.seed,
  referenceDate: run.referenceDate,
  rowCounts,
  durationMs: Math.round(performance.now() - startedAt),
});

const generate = async (config, sink) => {
  const startedAt = performance.now();
  const seed = config.seed ?? inventSeed();
  const referenceDate = config.referenceDate ?? new Date();
  const schema = extractCanonicalSchema(config.schema, { casing: config.casing });
  const plan = resolveGenerationPlan(schema, config.rules, config.counts);
  const order = orderTablesByDependency(schema);
  const run = {
    random: createRandomSource(seed),
    seed,
    referenceDate,
    lookups: await resolveLookups(config.lookups),
    pools: retainedPools(schema),
    sink,
    batchSize: config.batchSize ?? DEFAULT_BATCH_SIZE,
  };

  const rowCounts = {};
  for (const table of countedTables(order, plan)) {
    const planned = plannedTable(table, plan.get(table.key), config.counts[table.key]);
    await generateTable(planned, run);
    rowCounts[table.key] = planned.count;
  }

  return sink.end(generationReport(run, rowCounts, startedAt));
};

module.exports = { generate };
