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
    `Column ${table}.${column} references table ${referencedTable}, which is missing from the schema.`,
    `Add ${referencedTable} to the schema passed to generate, or leave ${table} out of it.`,
  ].join(' ');

class IncompleteSchemaError extends GenerationError {
  constructor({ table, column, referencedTable }) {
    super(incompleteSchemaMessage({ table, column, referencedTable }));
    this.table = table;
    this.column = column;
    this.referencedTable = referencedTable;
  }
}

module.exports = {
  GenerationError,
  UnsupportedColumnTypeError,
  MissingPrimaryKeyError,
  UnsupportedRelationshipError,
  IncompleteSchemaError,
};
