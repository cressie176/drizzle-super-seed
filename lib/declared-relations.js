const orm = require('drizzle-orm');

// Extraction is total: a schema which generates today must generate identically with its
// relations extracted, however badly they are declared. A relation which cannot be resolved is
// recorded with the reason, and only the graph sink's navigation property throws it, on access.

// drizzle-orm 1.0.0 removed the relations() API from the package root, keeping it under
// _relations, and replaced it with defineRelations. Which shapes a schema can hold is decided by
// what the installed drizzle-orm exports, never by a version number.
const v0Api = () => {
  if (orm.Relations) return orm;
  try {
    return require('drizzle-orm/_relations');
  } catch {
    return undefined;
  }
};

const v0 = v0Api();
const { is } = orm;

const propertyNamed = (table, databaseName) =>
  table.columns.find((column) => column.name === databaseName)?.propertyName;

const propertiesOf = (table, drizzleColumns) => drizzleColumns.map((column) => propertyNamed(table, column.name));

const unresolved = (reason) => ({ error: reason });

const declaredRelations = (schema) => Object.values(schema).filter((value) => is(value, v0.Relations));

const namedEntries = (declaration) =>
  Object.entries(declaration.config(v0.createTableRelationsHelpers(declaration.table)));

const carriesColumns = (relation) => is(relation, v0.One) && relation.config?.fields?.length > 0;

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
  const base = { tableKey: sourceKey, name, kind: is(relation, v0.One) ? 'one' : 'many' };
  const targetKey = tableKeys.get(relation.referencedTable);
  if (targetKey === undefined) return { ...base, ...unresolved('unknownTable') };
  return {
    ...base,
    foreignTableKey: targetKey,
    ...resolvedColumns(declarations, relation, tables.get(sourceKey), tables.get(targetKey)),
  };
};

const extractV0Relations = (schema, tableKeys, tables, byName) => {
  if (!v0) return;
  const declarations = declaredRelations(schema);
  for (const declaration of declarations) {
    const sourceKey = tableKeys.get(declaration.table);
    if (sourceKey === undefined) continue;
    for (const [name, relation] of namedEntries(declaration)) {
      byName.set(`${sourceKey}:${name}`, canonicalRelation(declarations, tableKeys, tables, sourceKey, name, relation));
    }
  }
};

// defineRelations returns a plain object keyed by table, each entry { table, name, relations }.
// The entries carry no brand, so the shape is the test; entries for tables (or views) the schema
// module does not export fall through the tableKeys lookup, keeping extraction total.
const v1TableEntry = (value) =>
  value !== null &&
  typeof value === 'object' &&
  typeof value.table === 'object' &&
  typeof value.name === 'string' &&
  value.relations !== null &&
  typeof value.relations === 'object';

const v1Declaration = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.values(value);
  return entries.length > 0 && entries.every(v1TableEntry);
};

const filtered = (relation) => relation.where !== undefined && relation.where !== orm.EmptyFilter;

// defineRelations resolves the underspecified side from its inverse eagerly and throws at define
// time when it cannot, so both column lists are always present here; only relations the graph
// cannot honour remain to be recorded: joins through a junction table, and where filters, which
// navigation would otherwise silently ignore, diverging from db.query.
const canonicalV1Relation = (tableKeys, tables, sourceKey, name, relation) => {
  const base = { tableKey: sourceKey, name, kind: relation.relationType };
  const targetKey = tableKeys.get(relation.targetTable);
  if (targetKey === undefined) return { ...base, ...unresolved('unknownTable') };
  const located = { ...base, foreignTableKey: targetKey };
  if (relation.throughTable) return { ...located, ...unresolved('through') };
  if (filtered(relation)) return { ...located, ...unresolved('filtered') };
  return {
    ...located,
    localColumns: propertiesOf(tables.get(sourceKey), relation.sourceColumns),
    foreignColumns: propertiesOf(tables.get(targetKey), relation.targetColumns),
  };
};

const extractV1Relations = (schema, tableKeys, tables, byName) => {
  if (!orm.defineRelations) return;
  for (const declaration of Object.values(schema).filter(v1Declaration)) {
    for (const entry of Object.values(declaration)) {
      const sourceKey = tableKeys.get(entry.table);
      if (sourceKey === undefined) continue;
      for (const [name, relation] of Object.entries(entry.relations)) {
        if (!is(relation, orm.Relation)) continue;
        byName.set(`${sourceKey}:${name}`, canonicalV1Relation(tableKeys, tables, sourceKey, name, relation));
      }
    }
  }
};

// Two declarations naming the same relation on one table: the later export wins, keyed here.
const extractDeclaredRelations = (schema, tableKeys, tables) => {
  const byName = new Map();
  extractV0Relations(schema, tableKeys, tables, byName);
  extractV1Relations(schema, tableKeys, tables, byName);
  return [...byName.values()];
};

module.exports = { extractDeclaredRelations };
