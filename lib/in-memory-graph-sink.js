const { AmbiguousRelationshipError } = require('./generation-errors');

const propertyNameOf = (table, columnName) => table.columns.find((column) => column.name === columnName).propertyName;

const indexKey = (value) => `${typeof value}:${value}`;

const collected = (table) => ({ table, rows: [], parentIndexes: new Map(), childIndexes: new Map() });

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

const rowsByTable = (collections) =>
  Object.fromEntries([...collections].map(([tableKey, collection]) => [tableKey, collection.rows]));

const createInMemoryGraphSink = () => {
  const collections = new Map();

  return {
    beginTable(table) {
      collections.set(table.key, collected(table));
    },
    writeRows(table, rows) {
      collections.get(table.key).rows.push(...rows);
    },
    end(report) {
      return { report, rows: rowsByTable(collections), ...navigation(collections) };
    },
  };
};

module.exports = { createInMemoryGraphSink };
