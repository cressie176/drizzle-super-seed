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

module.exports = { GenerationError, UnsupportedColumnTypeError };
