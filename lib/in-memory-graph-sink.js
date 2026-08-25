const { AmbiguousRelationshipError, UnresolvableRelationError } = require('./generation-errors');

const propertyNameOf = (table, columnName) => table.columns.find((column) => column.name === columnName).propertyName;

const indexKey = (value) => `${typeof value}:${value}`;

const collected = (table) => ({
  table,
  rows: [],
  parentIndexes: new Map(),
  childIndexes: new Map(),
  relationIndexes: new Map(),
});

const builtParentIndex = (collection, columnName) => {
  const property = propertyNameOf(collection.table, columnName);
  return new Map(collection.rows.map((row) => [indexKey(row[property]), row]));
};

const parentIndex = (collection, columnName) => {
  const existing = collection.parentIndexes.get(columnName);
  if (existing) return existing;
  const built = builtParentIndex(collection, columnName);
  collection.parentIndexes.set(columnName, built);
  return built;
};

const builtChildIndex = (collection, columnName) => {
  const property = propertyNameOf(collection.table, columnName);
  const grouped = new Map();
  for (const row of collection.rows) {
    const key = indexKey(row[property]);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return grouped;
};

const childIndex = (collection, columnName) => {
  const existing = collection.childIndexes.get(columnName);
  if (existing) return existing;
  const built = builtChildIndex(collection, columnName);
  collection.childIndexes.set(columnName, built);
  return built;
};

const foreignKeyNamed = (table, foreignKeyColumn) =>
  table.foreignKeys.find((foreignKey) => propertyNameOf(table, foreignKey.columnName) === foreignKeyColumn);

const soleForeignKey = (childTable, parentKey) => {
  const foreignKeys = childTable.foreignKeys.filter((foreignKey) => foreignKey.referencedTableKey === parentKey);
  if (foreignKeys.length === 1) return foreignKeys[0];
  throw new AmbiguousRelationshipError({
    parentTable: parentKey,
    childTable: childTable.key,
    columns: foreignKeys.map((foreignKey) => propertyNameOf(childTable, foreignKey.columnName)),
  });
};

const isAbsent = (value) => value === null || value === undefined;

const navigation = (collections) => ({
  parentOf(childTableKey, childRow, foreignKeyColumn) {
    const child = collections.get(childTableKey);
    const foreignKey = foreignKeyNamed(child.table, foreignKeyColumn);
    const parent = collections.get(foreignKey.referencedTableKey);
    if (isAbsent(childRow[foreignKeyColumn]) || !parent) return null;
    return parentIndex(parent, foreignKey.referencedColumnName).get(indexKey(childRow[foreignKeyColumn])) ?? null;
  },

  childrenOf(parentTableKey, parentRow, childTableKey) {
    const parent = collections.get(parentTableKey);
    const child = collections.get(childTableKey);
    const foreignKey = soleForeignKey(child.table, parentTableKey);
    const parentValue = parentRow[propertyNameOf(parent.table, foreignKey.referencedColumnName)];
    return childIndex(child, foreignKey.columnName).get(indexKey(parentValue)) ?? [];
  },
});

const matches = (row, primaryKey) =>
  Object.entries(primaryKey).every(([property, value]) => indexKey(row[property]) === indexKey(value));

// The collected rows are patched in place, so navigation and graph.rows never show pass-one NULLs.
const applyDeferredUpdates = (collection, updates) => {
  for (const update of updates) {
    Object.assign(
      collection.rows.find((row) => matches(row, update.primaryKey)),
      update.values,
    );
  }
};

const TUPLE_SEPARATOR = '\u001f';

const tupleKeyOf = (row, properties) => properties.map((property) => indexKey(row[property])).join(TUPLE_SEPARATOR);

const builtRelationIndex = (collection, properties) => {
  const grouped = new Map();
  for (const row of collection.rows) {
    const key = tupleKeyOf(row, properties);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return grouped;
};

const relationIndex = (collection, properties) => {
  const cacheKey = properties.join(TUPLE_SEPARATOR);
  const existing = collection.relationIndexes.get(cacheKey);
  if (existing) return existing;
  const built = builtRelationIndex(collection, properties);
  collection.relationIndexes.set(cacheKey, built);
  return built;
};

const throwUnresolvable = (relation) => {
  throw new UnresolvableRelationError({
    table: relation.tableKey,
    relation: relation.name,
    referencedTable: relation.foreignTableKey,
    reason: relation.error,
  });
};

const emptyNavigation = (relation) => (relation.kind === 'many' ? [] : []);

const relatedRows = (collections, relation, row) => {
  if (relation.error) throwUnresolvable(relation);
  const target = collections.get(relation.foreignTableKey);
  if (!target || relation.localColumns.some((property) => isAbsent(row[property]))) return emptyNavigation(relation);
  return relationIndex(target, relation.foreignColumns).get(tupleKeyOf(row, relation.localColumns)) ?? [];
};

const navigationValue = (collections, relation, row) => {
  const rows = relatedRows(collections, relation, row);
  return relation.kind === 'many' ? rows : (rows[0] ?? null);
};

// Navigation properties are non-enumerable, so rows still JSON.stringify, deepEqual and snapshot
// as plain data; lazy, so cycles cost nothing until walked; and resolved once, then frozen into a
// value so repeated access returns the identical object.
const defineNavigationProperty = (collections, relation, row) => {
  Object.defineProperty(row, relation.name, {
    configurable: true,
    enumerable: false,
    get() {
      const value = navigationValue(collections, relation, row);
      Object.defineProperty(row, relation.name, { configurable: true, enumerable: false, value });
      return value;
    },
  });
};

// A relation whose name matches a column keeps the column: rows stay faithful to the schema.
const defineNavigation = (collections, relations) => {
  for (const relation of relations) {
    const collection = collections.get(relation.tableKey);
    if (!collection) continue;
    for (const row of collection.rows.filter((row) => !Object.hasOwn(row, relation.name))) {
      defineNavigationProperty(collections, relation, row);
    }
  }
};

const rowsByTable = (collections) =>
  Object.fromEntries([...collections].map(([tableKey, collection]) => [tableKey, collection.rows]));

const createInMemoryGraphSink = () => {
  const collections = new Map();
  let declaredRelations = [];

  return {
    prepare(schema) {
      declaredRelations = schema.relations ?? [];
    },
    beginTable(table) {
      collections.set(table.key, collected(table));
    },
    writeRows(table, rows) {
      collections.get(table.key).rows.push(...rows);
    },
    writeDeferredUpdates(table, updates) {
      applyDeferredUpdates(collections.get(table.key), updates);
    },
    end(report) {
      defineNavigation(collections, declaredRelations);
      return { report, rows: rowsByTable(collections), ...navigation(collections) };
    },
  };
};

module.exports = { createInMemoryGraphSink };
