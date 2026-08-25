const { One, Relations, createTableRelationsHelpers, is } = require('drizzle-orm');

// Extraction is total: a schema which generates today must generate identically with its
// relations extracted, however badly they are declared. A relation which cannot be resolved is
// recorded with the reason, and only the graph sink's navigation property throws it, on access.

const declaredRelations = (schema) => Object.values(schema).filter((value) => is(value, Relations));

const propertyNamed = (table, databaseName) =>
  table.columns.find((column) => column.name === databaseName)?.propertyName;

const propertiesOf = (table, drizzleColumns) => drizzleColumns.map((column) => propertyNamed(table, column.name));

const namedEntries = (declaration) =>
  Object.entries(declaration.config(createTableRelationsHelpers(declaration.table)));

const carriesColumns = (relation) => is(relation, One) && relation.config?.fields?.length > 0;

const sameRelationName = (relation, candidate) => relation.relationName === candidate.relationName;

const inverseCandidates = (declarations, relation) =>
  declarations
    .filter((declaration) => declaration.table === relation.referencedTable)
    .flatMap(namedEntries)
    .map(([, candidate]) => candidate)
    .filter(
      (candidate) =>
        carriesColumns(candidate) &&
        candidate.referencedTable === relation.sourceTable &&
        sameRelationName(relation, candidate),
    );

const unresolved = (reason) => ({ error: reason });

const directColumns = (relation, sourceTable, targetTable) => ({
  localColumns: propertiesOf(sourceTable, relation.config.fields),
  foreignColumns: propertiesOf(targetTable, relation.config.references),
});

// The inverse one() is declared on the navigation's target, pointing back: its `references`
// live on our table and its `fields` on the target, so the pair swaps roles.
const invertedColumns = (inverse, sourceTable, targetTable) => ({
  localColumns: propertiesOf(sourceTable, inverse.config.references),
  foreignColumns: propertiesOf(targetTable, inverse.config.fields),
});

const resolvedColumns = (declarations, relation, sourceTable, targetTable) => {
  if (carriesColumns(relation)) return directColumns(relation, sourceTable, targetTable);
  const candidates = inverseCandidates(declarations, relation);
  if (candidates.length === 1) return invertedColumns(candidates[0], sourceTable, targetTable);
  return unresolved(candidates.length === 0 ? 'noInverse' : 'ambiguousInverse');
};

const canonicalRelation = (declarations, tableKeys, tables, sourceKey, name, relation) => {
  const base = { tableKey: sourceKey, name, kind: is(relation, One) ? 'one' : 'many' };
  const targetKey = tableKeys.get(relation.referencedTable);
  if (targetKey === undefined) return { ...base, ...unresolved('unknownTable') };
  return {
    ...base,
    foreignTableKey: targetKey,
    ...resolvedColumns(declarations, relation, tables.get(sourceKey), tables.get(targetKey)),
  };
};

// Two declarations naming the same relation on one table: the later export wins, keyed here.
const extractDeclaredRelations = (schema, tableKeys, tables) => {
  const declarations = declaredRelations(schema);
  const byName = new Map();
  for (const declaration of declarations) {
    const sourceKey = tableKeys.get(declaration.table);
    if (sourceKey === undefined) continue;
    for (const [name, relation] of namedEntries(declaration)) {
      byName.set(`${sourceKey}:${name}`, canonicalRelation(declarations, tableKeys, tables, sourceKey, name, relation));
    }
  }
  return [...byName.values()];
};

module.exports = { extractDeclaredRelations };
