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

class UnsupportedColumnTypeError extends GenerationError {
  constructor({ table, column, columnType }) {
    super(unsupportedColumnTypeMessage({ table, column, columnType }));
    this.table = table;
    this.column = column;
    this.columnType = columnType;
  }
}

const missingPrimaryKeyMessage = ({ table }) =>
  [
    `Table ${table} has no primary key, which drizzle-super-seed needs to reference its rows.`,
    'Give it one, or leave it out of the schema passed to generate.',
  ].join(' ');

class MissingPrimaryKeyError extends GenerationError {
  constructor({ table }) {
    super(missingPrimaryKeyMessage({ table }));
    this.table = table;
  }
}

const unsupportedRelationshipMessage = ({ table, columns }) =>
  [
    `Table ${table} has a composite foreign key on columns ${columns.join(', ')}.`,
    'Replace it with single column foreign keys, or leave the table out of the schema passed to generate.',
  ].join(' ');

class UnsupportedRelationshipError extends GenerationError {
  constructor({ table, columns }) {
    super(unsupportedRelationshipMessage({ table, columns }));
    this.table = table;
    this.columns = columns;
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
  UnsupportedColumnTypeError,
  MissingPrimaryKeyError,
  UnsupportedRelationshipError,
  IncompleteSchemaError,
  CircularDependencyError,
  MissingTableRulesError,
  MissingColumnRuleError,
  UnknownColumnRuleError,
  UnknownCountTableError,
  MissingParentCountError,
  InvalidPerParentError,
  NotNullSelfReferenceError,
  EmptyParentPoolError,
  UniqueConstraintExhaustedError,
  ColumnOrderError,
  UniqueValueExhaustedError,
};
