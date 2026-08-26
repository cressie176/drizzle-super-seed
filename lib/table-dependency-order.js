const { CircularDependencyError } = require('./generation-errors');

const columnNamed = (table, columnName) => table.columns.find((column) => column.name === columnName);

const isNullable = (table, columnName) => !columnNamed(table, columnName).notNull;

const crossTableForeignKeys = (table) =>
  table.foreignKeys.filter((foreignKey) => foreignKey.referencedTableKey !== table.key);

const dependencyEdge = (table, foreignKey) => ({
  tableKey: table.key,
  columnName: foreignKey.columnName,
  parentKey: foreignKey.referencedTableKey,
  nullable: isNullable(table, foreignKey.columnName),
});

// A composite edge orders tables like any other, but can never be broken into a deferred
// pass: a tuple cannot be half-patched, so a cycle whose only candidates are composite edges
// is refused as if every edge were NOT NULL.
const compositeEdges = (table) =>
  table.compositeForeignKeys
    .filter((foreignKey) => foreignKey.referencedTableKey !== table.key)
    .map((foreignKey) => ({
      tableKey: table.key,
      columnName: foreignKey.columns[0],
      parentKey: foreignKey.referencedTableKey,
      nullable: false,
    }));

const dependencyEdges = (tables) =>
  tables.flatMap((table) => [
    ...crossTableForeignKeys(table).map((foreignKey) => dependencyEdge(table, foreignKey)),
    ...compositeEdges(table),
  ]);

const parentsOf = (tableKey, edges) => edges.filter((edge) => edge.tableKey === tableKey).map((edge) => edge.parentKey);

const pathBetween = (from, target, edges, visited) => {
  if (from === target) return [from];
  if (visited.has(from)) return null;
  visited.add(from);
  for (const parent of parentsOf(from, edges)) {
    const remainder = pathBetween(parent, target, edges, visited);
    if (remainder) return [from, ...remainder];
  }
  return null;
};

const cycleThrough = (edge, edges) => {
  const path = pathBetween(edge.parentKey, edge.tableKey, edges, new Set());
  if (!path) return null;
  return [edge.tableKey, ...path.slice(0, -1)];
};

const stalledEdges = (pending, edges) => {
  const stalledKeys = new Set(pending.map((table) => table.key));
  return edges.filter((edge) => stalledKeys.has(edge.tableKey) && stalledKeys.has(edge.parentKey));
};

const breakableEdge = (edges) => edges.find((edge) => edge.nullable && cycleThrough(edge, edges));

const firstCycle = (edges) => edges.map((edge) => cycleThrough(edge, edges)).find(Boolean);

const requireBreakableEdge = (edges) => {
  const edge = breakableEdge(edges);
  if (edge) return edge;
  throw new CircularDependencyError({ tables: firstCycle(edges) });
};

const isReady = (table, edges, ordered) =>
  edges.every((edge) => edge.tableKey !== table.key || ordered.has(edge.parentKey));

const deferredForeignKey = (edge) => ({ tableKey: edge.tableKey, columnName: edge.columnName });

const orderTablesByDependency = (schema) => {
  const pending = [...schema.tables.values()];
  const edges = dependencyEdges(pending);
  const orderedKeys = new Set();
  const tables = [];
  const deferredForeignKeys = [];

  while (pending.length > 0) {
    const next = pending.findIndex((table) => isReady(table, edges, orderedKeys));
    if (next === -1) {
      const edge = requireBreakableEdge(stalledEdges(pending, edges));
      edges.splice(edges.indexOf(edge), 1);
      deferredForeignKeys.push(deferredForeignKey(edge));
      continue;
    }
    const [table] = pending.splice(next, 1);
    orderedKeys.add(table.key);
    tables.push(table);
  }

  return { tables, deferredForeignKeys };
};

module.exports = { orderTablesByDependency };
