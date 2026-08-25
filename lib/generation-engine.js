const { randomUUID } = require('node:crypto');
const { extractCanonicalSchema } = require('./drizzle-schema-adapter');
const {
  ColumnOrderError,
  EmptyParentPoolError,
  InvalidPerParentError,
  MissingParentCountError,
  UniqueConstraintExhaustedError,
} = require('./generation-errors');
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

const engineNumbered = (columns, overridden) =>
  columns.every((column) => column.sequenceOwned && !overridden.has(column.propertyName));

const plannedConstraint = (entries, columnNames) => {
  const constrained = columnNames.map((columnName) => entries.find((entry) => entry.column.name === columnName));
  return { entries: constrained, columns: constrained.map((entry) => entry.column), emitted: new Set() };
};

const distinctColumnLists = (columnLists) => [...new Map(columnLists.map((list) => [list.join(), list])).values()];

const plannedConstraints = (table, entries, overridden) =>
  distinctColumnLists(constraintColumnLists(table))
    .map((columnNames) => plannedConstraint(entries, columnNames))
    .filter((constraint) => !engineNumbered(constraint.columns, overridden));

const overriddenProperties = (overrides) => new Set(overrides.flatMap((override) => Object.keys(override)));

const primaryKeyProperties = (table) => {
  const propertyNames = propertyNamesOf(table);
  return table.primaryKey.map((columnName) => propertyNames.get(columnName));
};

const perParentForeignKeys = (table, parentKey) =>
  table.foreignKeys.filter((foreignKey) => foreignKey.referencedTableKey === parentKey);

const requireOtherTable = (tableKey, parentKey) => {
  if (parentKey !== tableKey) return;
  throw new InvalidPerParentError({ reason: 'ownTable', table: tableKey, parentTable: parentKey, columns: [] });
};

const requireCountedParent = (tableKey, parentKey, counts) => {
  if (Object.hasOwn(counts, parentKey)) return;
  throw new MissingParentCountError({ table: tableKey, parentTable: parentKey });
};

const ambiguityOf = (foreignKeys) => (foreignKeys.length === 0 ? 'noForeignKey' : 'ambiguousForeignKey');

const soleForeignKey = (table, parentKey, propertyNames) => {
  const foreignKeys = perParentForeignKeys(table, parentKey);
  if (foreignKeys.length === 1) return foreignKeys[0];
  throw new InvalidPerParentError({
    reason: ambiguityOf(foreignKeys),
    table: table.key,
    parentTable: parentKey,
    columns: foreignKeys.map((foreignKey) => propertyNames.get(foreignKey.columnName)),
  });
};

const perParentLink = (table, count, counts, propertyNames) => {
  requireOtherTable(table.key, count.per);
  requireCountedParent(table.key, count.per, counts);
  const foreignKey = soleForeignKey(table, count.per, propertyNames);
  return {
    parentKey: count.per,
    childProperty: propertyNames.get(foreignKey.columnName),
    parentColumn: foreignKey.referencedColumnName,
    count: count.count,
    retain: count.retain ?? [],
  };
};

const isPerParent = (count) => typeof count === 'object';

const fixedCount = (count, overrides) => (isPerParent(count) ? undefined : Math.max(count, overrides.length));

const perParentLinks = (schema, counts) => {
  const declared = Object.entries(counts).filter(([key, count]) => isPerParent(count) && schema.tables.has(key));
  return new Map(
    declared.map(([key, count]) => {
      const table = schema.tables.get(key);
      return [key, perParentLink(table, count, counts, propertyNamesOf(table))];
    }),
  );
};

const plannedTable = (table, planEntries, counts, overrides, links) => {
  const entries = planEntries.map((entry) => plannedColumn(table, entry));
  const tableOverrides = overrides[table.key] ?? [];
  return {
    table,
    entries,
    propertyNames: propertyNamesOf(table),
    overrides: tableOverrides,
    constraints: plannedConstraints(table, entries, overriddenProperties(tableOverrides)),
    count: fixedCount(counts[table.key], tableOverrides),
    perParent: links.get(table.key),
  };
};

const parentProperties = (schema, link) => {
  const parent = schema.tables.get(link.parentKey);
  return [...primaryKeyProperties(parent), propertyNamesOf(parent).get(link.parentColumn), ...link.retain];
};

const parentRetention = (schema, plannedTables) => {
  const retention = new Map();
  for (const planned of plannedTables.filter((each) => each.perParent)) {
    const properties = retention.get(planned.perParent.parentKey) ?? new Set();
    for (const property of parentProperties(schema, planned.perParent)) properties.add(property);
    retention.set(planned.perParent.parentKey, properties);
  }
  return retention;
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

const parentRowContext = (parentRow) => (parentRow === undefined ? {} : { parentRow });

const rowContext = (run, planned, row, rowIndex, cursor, parentRow) => ({
  random: run.random,
  seed: run.seed,
  row: rowView(planned.table, row, cursor, run),
  rowIndex,
  ...parentRowContext(parentRow),
  lookups: run.lookups,
  referenceDate: run.referenceDate,
});

const countContext = (run, parentRow, parentIndex) => ({
  random: run.random,
  seed: run.seed,
  row: Object.freeze({}),
  parentRow,
  rowIndex: parentIndex,
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

const pinnedValue = (pin, context) => (typeof pin === 'function' ? pin(context) : pin);

const columnValue = (planned, entry, context, run, pins) => {
  const { propertyName } = entry.column;
  if (Object.hasOwn(pins, propertyName)) return pinnedValue(pins[propertyName], context);
  if (entry.generator === null) return parentReference(planned, entry, run);
  if (entry.selfReferencing) return entry.generator(priorRowContext(context, entry, run));
  return entry.generator(context);
};

const writeColumns = (planned, entries, row, context, cursor, run, pins) => {
  for (const entry of entries) {
    cursor.column = entry.column.propertyName;
    row[entry.column.propertyName] = columnValue(planned, entry, context, run, pins);
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

const regenerable = (constraint, pins) =>
  constraint.entries.filter((entry) => !Object.hasOwn(pins, entry.column.propertyName));

const settleConstraints = (planned, row, context, cursor, run, pins) => {
  let clash = clashingConstraint(planned, row);
  for (let attempt = 0; clash && attempt < MAX_UNIQUE_ATTEMPTS; attempt++) {
    writeColumns(planned, regenerable(clash, pins), row, context, cursor, run, pins);
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

const retainParentRow = (planned, row, run) => {
  const retained = run.parentRetention.get(planned.table.key);
  if (!retained) return;
  run.parentRows.get(planned.table.key).push(Object.fromEntries([...retained].map((name) => [name, row[name]])));
};

const retainRow = (planned, row, run) => {
  for (const [columnName, values] of run.pools.get(planned.table.key)) {
    values.push(row[planned.propertyNames.get(columnName)]);
  }
  retainParentRow(planned, row, run);
};

const pinsFor = (planned, rowIndex, parentPin) => ({ ...parentPin, ...planned.overrides[rowIndex] });

const generateRow = (planned, rowIndex, run, parentRow, parentPin) => {
  const row = {};
  const cursor = { column: null };
  const context = rowContext(run, planned, row, rowIndex, cursor, parentRow);
  const pins = pinsFor(planned, rowIndex, parentPin);
  writeColumns(planned, planned.entries, row, context, cursor, run, pins);
  settleConstraints(planned, row, context, cursor, run, pins);
  retainRow(planned, row, run);
  return row;
};

const createBatcher = (planned, run) => {
  let batch = [];
  const write = async () => {
    const written = batch;
    batch = [];
    await run.sink.writeRows(planned.table, written);
  };
  return {
    add: async (row) => {
      batch.push(row);
      if (batch.length === run.batchSize) await write();
    },
    flush: async () => {
      if (batch.length > 0) await write();
    },
  };
};

const generateFixedRows = async (planned, run, batcher) => {
  for (let rowIndex = 0; rowIndex < planned.count; rowIndex++) {
    await batcher.add(generateRow(planned, rowIndex, run, undefined, undefined));
  }
  return planned.count;
};

const generatePerParentRows = async (planned, run, batcher) => {
  const { childProperty, parentColumn, parentKey } = planned.perParent;
  const parentProperty = propertyNamesOf(run.schema.tables.get(parentKey)).get(parentColumn);
  let rowIndex = 0;
  for (const [parentIndex, parentRow] of run.parentRows.get(parentKey).entries()) {
    const parentPin = { [childProperty]: parentRow[parentProperty] };
    const children = planned.perParent.count(countContext(run, parentRow, parentIndex));
    for (let child = 0; child < children; child++) {
      await batcher.add(generateRow(planned, rowIndex, run, parentRow, parentPin));
      rowIndex += 1;
    }
  }
  return rowIndex;
};

const rowGenerators = { fixed: generateFixedRows, perParent: generatePerParentRows };

const generateTable = async (planned, run) => {
  await run.sink.beginTable?.(planned.table);
  const batcher = createBatcher(planned, run);
  const generated = await rowGenerators[planned.perParent ? 'perParent' : 'fixed'](planned, run, batcher);
  await batcher.flush();
  await run.sink.endTable?.(planned.table);
  return generated;
};

const countedTables = (order, plan) => order.tables.filter((table) => plan.has(table.key));

const generationReport = (run, rowCounts, startedAt) => ({
  seed: run.seed,
  referenceDate: run.referenceDate,
  rowCounts,
  durationMs: Math.round(performance.now() - startedAt),
});

const emptyParentRows = (retention) => new Map([...retention.keys()].map((key) => [key, []]));

const generate = async (config, sink) => {
  const startedAt = performance.now();
  const seed = config.seed ?? inventSeed();
  const referenceDate = config.referenceDate ?? new Date();
  const schema = extractCanonicalSchema(config.schema, { casing: config.casing });
  const links = perParentLinks(schema, config.counts);
  const plan = resolveGenerationPlan(schema, config.rules, config.counts);
  const order = orderTablesByDependency(schema);
  const plannedTables = countedTables(order, plan).map((table) =>
    plannedTable(table, plan.get(table.key), config.counts, config.overrides ?? {}, links),
  );
  const retention = parentRetention(schema, plannedTables);
  const run = {
    random: createRandomSource(seed),
    seed,
    referenceDate,
    schema,
    lookups: await resolveLookups(config.lookups),
    pools: retainedPools(schema),
    parentRetention: retention,
    parentRows: emptyParentRows(retention),
    sink,
    batchSize: config.batchSize ?? DEFAULT_BATCH_SIZE,
  };

  const rowCounts = {};
  for (const planned of plannedTables) {
    rowCounts[planned.table.key] = await generateTable(planned, run);
  }

  return sink.end(generationReport(run, rowCounts, startedAt));
};

module.exports = { generate };
