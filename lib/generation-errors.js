class GenerationError extends Error {
  constructor(message) {
    super(message);
    this.name = new.target.name;
  }
}

const unsupportedColumnTypeMessage = ({ table, column, columnType }) =>
  [
    `Column ${table}.${column} has unsupported drizzle column type ${columnType}.`,
    'Change it to a supported type, or leave its table out of the schema passed to generate.',
  ].join(' ');

// Authoring-time and seedless by design: the configuration cannot describe a distribution whatever
// the run, so there is no seed to reproduce and no table or column involved. `UnserialisableValueError`
// set the precedent for a seedless error.
const invalidGeneratorConfigurationMessages = {
  noEntries: ({ factory }) =>
    `${factory} was given no entries, so there is nothing to draw. Give it at least one entry.`,
  zeroWeights: ({ factory }) =>
    [
      `${factory} was given weights which are all zero, so no entry can ever be drawn.`,
      'Give at least one entry a positive weight.',
    ].join(' '),
  negativeWeight: ({ factory, value }) =>
    [
      `${factory} was given the weight ${value}, which breaks the running totals it draws from and makes`,
      'the distribution a constant. Every weight must be zero or more.',
    ].join(' '),
  unusableWeight: ({ factory, value }) =>
    `${factory} was given the weight ${value}, which is not a finite number. Every weight must be one.`,
  unorderedRange: ({ factory, min, max }) =>
    `${factory} was given the range ${min} to ${max}, which is empty. The lower bound must not exceed the upper.`,
  fractionalBound: ({ factory, value }) =>
    `${factory} was given the bound ${value}, which is not a whole number. Both bounds must be integers.`,
  unusableBound: ({ factory, value }) =>
    `${factory} was given the bound ${value}, which is not a finite number. Both bounds must be finite.`,
  unusableSkew: ({ factory, value }) =>
    `${factory} was given the skew ${value}, which cannot weight its ranks. The skew must be zero or more.`,
  unusableMean: ({ factory, value }) =>
    `${factory} was given the mean ${value}, which is not a finite number. The mean must be one.`,
  unusableDeviation: ({ factory, value }) =>
    [
      `${factory} was given the standard deviation ${value}, which describes no spread.`,
      'The standard deviation must be zero or more.',
    ].join(' '),
  unorderedClamp: ({ factory, min, max }) =>
    [
      `${factory} was given a clamp of ${min} to ${max}, so every value would be forced to the same number.`,
      'The clamp minimum must not exceed its maximum.',
    ].join(' '),
  unusableScale: ({ factory, value }) =>
    [
      `${factory} was given the scale ${value}, which is not a whole number of zero or more.`,
      'The scale is how many decimal places to emit.',
    ].join(' '),
  unusableProbability: ({ factory, value }) =>
    `${factory} was given the probability ${value}, which is outside 0 to 1.`,
  unusableLength: ({ factory, value }) =>
    `${factory} was given the length ${value}, which cannot make a word. Lengths must be one or more.`,
  unusableDimensions: ({ factory, value }) =>
    [
      `${factory} was given ${value} dimensions, which describes no vector.`,
      'The dimension must be a whole number of one or more.',
    ].join(' '),
  unusableAttempts: ({ factory, value }) =>
    [
      `${factory} was given ${value} attempts, so it could never draw a value.`,
      'The attempt limit must be one or more.',
    ].join(' '),
};

const unresolvableRelationMessages = {
  noInverse: ({ table, relation, referencedTable }) =>
    [
      `Relation ${table}.${relation} cannot be resolved: no inverse one() with fields and references`,
      `is declared on ${referencedTable}. Declare the inverse, or navigate with childrenOf.`,
    ].join(' '),
  ambiguousInverse: ({ table, relation, referencedTable }) =>
    [
      `Relation ${table}.${relation} cannot be resolved: more than one inverse one() on ${referencedTable}`,
      'could serve it. Give each pair the same relationName so they match up.',
    ].join(' '),
  unknownTable: ({ table, relation }) =>
    [
      `Relation ${table}.${relation} references a table missing from the schema module.`,
      'Export the referenced table alongside its relations.',
    ].join(' '),
};

class UnresolvableRelationError extends GenerationError {
  constructor({ table, relation, referencedTable, reason }) {
    super(unresolvableRelationMessages[reason]({ table, relation, referencedTable }));
    this.table = table;
    this.relation = relation;
    if (referencedTable) this.referencedTable = referencedTable;
    this.reason = reason;
  }
}

class InvalidGeneratorConfigurationError extends GenerationError {
  constructor({ factory, reason, value, min, max }) {
    super(invalidGeneratorConfigurationMessages[reason]({ factory, value, min, max }));
    this.factory = factory;
    this.reason = reason;
  }
}

class UnsupportedColumnTypeError extends GenerationError {
  constructor({ table, column, columnType }) {
    super(unsupportedColumnTypeMessage({ table, column, columnType }));
    this.table = table;
    this.column = column;
    this.columnType = columnType;
  }
}

const missingPrimaryKeyMessages = {
  perParent: ({ table, childTable }) =>
    [
      `Table ${table} has no primary key, but ${childTable} is counted per ${table} row and the engine`,
      "iterates the parent's primary key to do that.",
      `Give ${table} a primary key, or count ${childTable} with a plain number.`,
    ].join(' '),
  deferredColumn: ({ table, column }) =>
    [
      `Table ${table} has no primary key, but it owns the deferred foreign key column ${column}, and`,
      'the second pass identifies the rows it patches by primary key.',
      `Give ${table} a primary key, or break the cycle elsewhere.`,
    ].join(' '),
};

class MissingPrimaryKeyError extends GenerationError {
  constructor({ reason, table, childTable, column }) {
    super(missingPrimaryKeyMessages[reason]({ table, childTable, column }));
    this.reason = reason;
    this.table = table;
    if (childTable) this.childTable = childTable;
    if (column) this.column = column;
  }
}

const incompleteSchemaMessage = ({ table, column, referencedTable }) =>
  [
    `Column ${table}.${column} references database table ${referencedTable}, which is missing from the schema.`,
    `Add the export which declares ${referencedTable} to the schema passed to generate, or leave ${table} out of it.`,
  ].join(' ');

class IncompleteSchemaError extends GenerationError {
  constructor({ table, column, referencedTable }) {
    super(incompleteSchemaMessage({ table, column, referencedTable }));
    this.table = table;
    this.column = column;
    this.referencedTable = referencedTable;
  }
}

const cycleTrail = (tables) => [...tables, tables[0]].join(' -> ');

const circularDependencyMessage = ({ tables }) =>
  [
    `Tables ${cycleTrail(tables)} form a circular dependency in which every foreign key is not null.`,
    'No row of the cycle can be inserted first, so make one of its foreign keys nullable',
    'and drizzle-super-seed will break the cycle there automatically.',
  ].join(' ');

class CircularDependencyError extends GenerationError {
  constructor({ tables }) {
    super(circularDependencyMessage({ tables }));
    this.tables = tables;
  }
}

const missingTableRulesMessage = ({ table }) =>
  [
    `Table ${table} has a count but no rules object, so drizzle-super-seed does not know what to put in its columns.`,
    `Add a rules object for ${table}, or remove it from counts.`,
  ].join(' ');

const unseededTableCountedMessage = ({ table }) =>
  [
    `Table ${table} is marked unseeded in the rules, but counts asks for rows.`,
    'Remove the count, or replace unseeded with a rules object.',
  ].join(' ');

class UnseededTableCountedError extends GenerationError {
  constructor({ table }) {
    super(unseededTableCountedMessage({ table }));
    this.table = table;
  }
}

class MissingTableRulesError extends GenerationError {
  constructor({ table }) {
    super(missingTableRulesMessage({ table }));
    this.table = table;
  }
}

const missingColumnRuleMessage = ({ table, column }) =>
  [
    `The rules for table ${table} have no rule for column ${column}.`,
    `Add one, or write ${column}: structuralDefault to accept the derived default.`,
  ].join(' ');

class MissingColumnRuleError extends GenerationError {
  constructor({ table, column }) {
    super(missingColumnRuleMessage({ table, column }));
    this.table = table;
    this.column = column;
  }
}

const unknownColumnRuleMessage = ({ table, column }) =>
  [
    `The rules for table ${table} have a rule for column ${column}, which ${table} does not have.`,
    'Correct the column name, or remove the rule.',
  ].join(' ');

class UnknownColumnRuleError extends GenerationError {
  constructor({ table, column }) {
    super(unknownColumnRuleMessage({ table, column }));
    this.table = table;
    this.column = column;
  }
}

const unknownCountTableMessage = ({ table }) =>
  [
    `Counts include table ${table}, which the schema does not have.`,
    `Correct the table name, or add ${table} to the schema passed to generate.`,
  ].join(' ');

class UnknownCountTableError extends GenerationError {
  constructor({ table }) {
    super(unknownCountTableMessage({ table }));
    this.table = table;
  }
}

const missingColumnParentCountMessage = ({ table, column, parentTable }) =>
  [
    `Column ${table}.${column} references table ${parentTable}, which has no count, so there are no rows to reference.`,
    `Add a count for ${parentTable}, or give ${table}.${column} a rule of its own.`,
  ].join(' ');

const missingPerParentCountMessage = ({ table, parentTable }) =>
  [
    `Table ${table} is counted per ${parentTable} row, but ${parentTable} has no count of its own,`,
    `so there are no rows to count against. Add a count for ${parentTable}, or give ${table} a fixed count.`,
  ].join(' ');

const missingParentCountMessage = (fields) =>
  fields.column === undefined ? missingPerParentCountMessage(fields) : missingColumnParentCountMessage(fields);

class MissingParentCountError extends GenerationError {
  constructor({ table, column, parentTable }) {
    super(missingParentCountMessage({ table, column, parentTable }));
    this.table = table;
    this.column = column;
    this.parentTable = parentTable;
  }
}

const invalidPerParentMessages = {
  ownTable: ({ table }) =>
    [
      `Table ${table} is counted per ${table} row, which is its own table, so it has no parent to count against.`,
      `Give ${table} a fixed count, or count it per the table it belongs to.`,
    ].join(' '),
  noForeignKey: ({ table, parentTable }) =>
    [
      `Table ${table} is counted per ${parentTable} row, but has no foreign key to ${parentTable},`,
      `so there is no column to attach a ${parentTable} row to.`,
      `Count ${table} per a table it references, or give it a fixed count.`,
    ].join(' '),
  deferredEdge: ({ table, parentTable, columns }) =>
    [
      `Table ${table} is counted per ${parentTable} row, but ${table}.${columns[0]} is the foreign key`,
      `drizzle-super-seed defers to break the cycle between them, so ${parentTable} rows do not exist`,
      `while ${table} generates. Count ${parentTable} per ${table} instead, or give ${table} a fixed count.`,
    ].join(' '),
  ambiguousForeignKey: ({ table, parentTable, columns }) =>
    [
      `Table ${table} is counted per ${parentTable} row, but references ${parentTable} through`,
      `${columns.join(' and ')}, so drizzle-super-seed cannot tell which column the count belongs to.`,
      `Give ${table} a fixed count, and pin the relationship you mean with a rule on the column.`,
    ].join(' '),
};

class InvalidPerParentError extends GenerationError {
  constructor({ reason, table, parentTable, columns }) {
    super(invalidPerParentMessages[reason]({ table, parentTable, columns }));
    this.reason = reason;
    this.table = table;
    this.parentTable = parentTable;
    this.columns = columns;
  }
}

const notNullSelfReferenceMessage = ({ table, column }) =>
  [
    `Column ${table}.${column} references its own table and is not null, so the first row generated has nothing to reference.`,
    `Make ${table}.${column} nullable, or give it a rule which does not depend on earlier rows.`,
  ].join(' ');

class NotNullSelfReferenceError extends GenerationError {
  constructor({ table, column }) {
    super(notNullSelfReferenceMessage({ table, column }));
    this.table = table;
    this.column = column;
  }
}

const emptyParentPoolMessage = ({ table, column, parentTable, seed }) =>
  [
    `Column ${table}.${column} is a not null foreign key to table ${parentTable},`,
    `which generated no rows with seed ${seed}, so there is nothing for it to reference.`,
    `Raise the count for ${parentTable} above zero, or make ${table}.${column} nullable.`,
  ].join(' ');

class EmptyParentPoolError extends GenerationError {
  constructor({ table, column, parentTable, seed }) {
    super(emptyParentPoolMessage({ table, column, parentTable, seed }));
    this.table = table;
    this.column = column;
    this.parentTable = parentTable;
    this.seed = seed;
  }
}

const uniqueConstraintExhaustedMessage = ({ table, columns, attempts, seed }) =>
  [
    `Could not generate a row of ${table} satisfying the unique constraint on ${columns.join(', ')}`,
    `in ${attempts} attempts with seed ${seed}.`,
    'Widen the range of values its columns can produce, or generate fewer rows.',
  ].join(' ');

class UniqueConstraintExhaustedError extends GenerationError {
  constructor({ table, columns, attempts, seed }) {
    super(uniqueConstraintExhaustedMessage({ table, columns, attempts, seed }));
    this.table = table;
    this.columns = columns;
    this.attempts = attempts;
    this.seed = seed;
  }
}

const columnOrderMessage = ({ table, column, readColumn, seed }) =>
  [
    `The rule for column ${table}.${column} read column ${readColumn},`,
    `which has not been generated yet with seed ${seed}.`,
    `Columns are generated in declaration order, so declare ${readColumn} before ${column},`,
    `or derive ${column} from a column which already precedes it.`,
  ].join(' ');

class ColumnOrderError extends GenerationError {
  constructor({ table, column, readColumn, seed }) {
    super(columnOrderMessage({ table, column, readColumn, seed }));
    this.table = table;
    this.column = column;
    this.readColumn = readColumn;
    this.seed = seed;
  }
}

const describedValue = (value) => {
  if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
  if (typeof value === 'symbol') return 'a symbol';
  if (typeof value === 'function') return 'a function';
  if (value instanceof Date) return `the date ${value.toISOString()}`;
  return `the ${typeof value} ${String(value)}`;
};

const unserialisableValue = (value) => (typeof value === 'symbol' ? String(value) : `${value}`);

const unserialisableValueMessage = ({ table, column, description }) =>
  [
    `Column ${table}.${column} holds ${description}, which cannot be written to a PostgreSQL COPY stream.`,
    'Correct the rule which produced it, or the override which pinned it.',
  ].join(' ');

class UnserialisableValueError extends GenerationError {
  constructor({ table, column, value }) {
    super(unserialisableValueMessage({ table, column, description: describedValue(value) }));
    this.table = table;
    this.column = column;
    this.value = unserialisableValue(value);
  }
}

const relationshipCandidates = (columns) =>
  columns.length === 0 ? 'no foreign key at all' : `foreign keys ${columns.join(' and ')}`;

const ambiguousRelationshipMessage = ({ parentTable, childTable, columns }) =>
  [
    `Table ${childTable} has ${relationshipCandidates(columns)} to table ${parentTable},`,
    'so childrenOf cannot tell which relationship you mean.',
    `Navigate from the ${childTable} side with parentOf, naming the column.`,
  ].join(' ');

class AmbiguousRelationshipError extends GenerationError {
  constructor({ parentTable, childTable, columns }) {
    super(ambiguousRelationshipMessage({ parentTable, childTable, columns }));
    this.parentTable = parentTable;
    this.childTable = childTable;
    this.columns = columns;
  }
}

const outputDirectoryNotEmptyMessage = ({ directory, entries }) =>
  [
    `Directory ${directory} already holds ${entries.length} entries, and drizzle-super-seed will not`,
    'mix fresh output with stale files. Empty it, or generate into a directory of its own.',
  ].join(' ');

class OutputDirectoryNotEmptyError extends GenerationError {
  constructor({ directory, entries }) {
    super(outputDirectoryNotEmptyMessage({ directory, entries }));
    this.directory = directory;
    this.entries = entries;
  }
}

const deferredUpdatesUnsupportedMessage = ({ tables, columns }) =>
  [
    `Tables ${tables.join(' and ')} form a cycle, which drizzle-super-seed breaks by leaving`,
    `${columns.join(', ')} until every table has been generated. This sink cannot apply that second`,
    'pass. Use a sink which implements writeDeferredUpdates, or give createRowBatchSink a deferred',
    'update handler.',
  ].join(' ');

class DeferredUpdatesUnsupportedError extends GenerationError {
  constructor({ tables, columns }) {
    super(deferredUpdatesUnsupportedMessage({ tables, columns }));
    this.tables = tables;
    this.columns = columns;
  }
}

const mixedDialectMessage = ({ dialects, tables }) =>
  [
    `The schema mixes ${dialects.join(' and ')} tables, and drizzle-super-seed generates one dialect at a time:`,
    `${dialects.map((dialect) => `${dialect} (${tables[dialect].join(', ')})`).join(', ')}.`,
    'Split them into a schema module per dialect, and generate each separately.',
  ].join(' ');

const emptySchemaMessage = () =>
  [
    'The schema module contains no drizzle tables. Either the import points at the wrong module,',
    'or node_modules holds more than one copy of drizzle-orm, in which case no table is recognised',
    'as one: check with npm ls drizzle-orm and deduplicate.',
  ].join(' ');

const undeclaredVectorDimensionMessage = ({ table, column }) =>
  [
    `Column ${table}.${column} is a vector which declares no dimension, so no value can be derived`,
    'for a NOT NULL column. Declare the dimension, or write a rule for it.',
  ].join(' ');

class UndeclaredVectorDimensionError extends GenerationError {
  constructor({ table, column }) {
    super(undeclaredVectorDimensionMessage({ table, column }));
    this.table = table;
    this.column = column;
  }
}

// pgvector's own message arrives at load time, potentially hours into a pipeline; this one
// names the column while the value is still in hand.
const vectorDimensionMismatchMessage = ({ table, column, expected, actual }) =>
  [
    `Column ${table}.${column} is a vector(${expected}), but a rule produced ${actual} components.`,
    'Generate the declared number, or correct the column.',
  ].join(' ');

class VectorDimensionMismatchError extends GenerationError {
  constructor({ table, column, expected, actual }) {
    super(vectorDimensionMismatchMessage({ table, column, expected, actual }));
    this.table = table;
    this.column = column;
    this.expected = expected;
    this.actual = actual;
  }
}

const compositeForeignKeyRuleRequiredMessage = ({ table, column, columns, referencedTable }) =>
  [
    `Column ${table}.${column} belongs to the composite foreign key (${columns.join(', ')})`,
    `referencing ${referencedTable}, and tuple members cannot be picked independently.`,
    'Write rules for these columns that keep the tuple valid together.',
  ].join(' ');

class CompositeForeignKeyRuleRequiredError extends GenerationError {
  constructor({ table, column, columns, referencedTable }) {
    super(compositeForeignKeyRuleRequiredMessage({ table, column, columns, referencedTable }));
    this.table = table;
    this.column = column;
    this.columns = columns;
    this.referencedTable = referencedTable;
  }
}

const customColumnRuleRequiredMessage = ({ table, column, customType }) =>
  [
    `Column ${table}.${column} is the custom type ${customType}, which declares nothing a default`,
    'could be derived from. Write a rule for it.',
  ].join(' ');

class CustomColumnRuleRequiredError extends GenerationError {
  constructor({ table, column, customType }) {
    super(customColumnRuleRequiredMessage({ table, column, customType }));
    this.table = table;
    this.column = column;
    this.customType = customType;
  }
}

class EmptySchemaError extends GenerationError {
  constructor() {
    super(emptySchemaMessage());
  }
}

class MixedDialectError extends GenerationError {
  constructor({ dialects, tables }) {
    super(mixedDialectMessage({ dialects, tables }));
    this.dialects = dialects;
    this.tables = tables;
  }
}

const wrongDialectMessage = ({ sinkDialect, schemaDialect }) =>
  [
    `This sink writes ${sinkDialect}, but the schema is ${schemaDialect}.`,
    `Use the ${schemaDialect} sink, or one of the sinks which serve every dialect:`,
    'createInMemoryGraphSink and createRowBatchSink.',
  ].join(' ');

class WrongDialectError extends GenerationError {
  constructor({ sinkDialect, schemaDialect }) {
    super(wrongDialectMessage({ sinkDialect, schemaDialect }));
    this.sinkDialect = sinkDialect;
    this.schemaDialect = schemaDialect;
  }
}

const invalidFilePrefixMessage = ({ prefix }) =>
  [
    `The file prefix ${prefix} contains a path separator, which would write outside the output`,
    'directory. Give a prefix of ordinary file name characters.',
  ].join(' ');

class InvalidFilePrefixError extends GenerationError {
  constructor({ prefix }) {
    super(invalidFilePrefixMessage({ prefix }));
    this.prefix = prefix;
  }
}

const tooManyFilesMessage = ({ limit, table }) =>
  [
    `Generating ${table} would need more than ${limit} numbered files, and the numbering would then`,
    'collide with the finalise file and load out of order.',
    'Generate fewer tables per run, into a directory each.',
  ].join(' ');

class TooManyOutputFilesError extends GenerationError {
  constructor({ limit, table }) {
    super(tooManyFilesMessage({ limit, table }));
    this.limit = limit;
    this.table = table;
  }
}

const uniqueValueExhaustedMessage = ({ attempts, seed }) =>
  [
    `Could not generate a unique value in ${attempts} attempts with seed ${seed}.`,
    'Widen the range of values the generator can produce, or replace unique() with sequence(),',
    'which is unique by construction.',
  ].join(' ');

class UniqueValueExhaustedError extends GenerationError {
  constructor({ attempts, seed }) {
    super(uniqueValueExhaustedMessage({ attempts, seed }));
    this.attempts = attempts;
    this.seed = seed;
  }
}

module.exports = {
  GenerationError,
  InvalidGeneratorConfigurationError,
  UnresolvableRelationError,
  UnsupportedColumnTypeError,
  MissingPrimaryKeyError,
  IncompleteSchemaError,
  CircularDependencyError,
  MissingTableRulesError,
  UnseededTableCountedError,
  MissingColumnRuleError,
  UnknownColumnRuleError,
  UnknownCountTableError,
  MissingParentCountError,
  InvalidPerParentError,
  NotNullSelfReferenceError,
  EmptyParentPoolError,
  UniqueConstraintExhaustedError,
  ColumnOrderError,
  UnserialisableValueError,
  AmbiguousRelationshipError,
  OutputDirectoryNotEmptyError,
  InvalidFilePrefixError,
  TooManyOutputFilesError,
  DeferredUpdatesUnsupportedError,
  MixedDialectError,
  WrongDialectError,
  UniqueValueExhaustedError,
  EmptySchemaError,
  CustomColumnRuleRequiredError,
  CompositeForeignKeyRuleRequiredError,
  UndeclaredVectorDimensionError,
  VectorDimensionMismatchError,
};
