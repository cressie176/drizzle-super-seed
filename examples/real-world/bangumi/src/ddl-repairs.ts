// drizzle-kit generate emits DDL for this schema that MariaDB will not accept. Neither defect is
// drizzle-super-seed's, and neither stops the library reading the module: they are what you get
// when a schema is written to query a database that already exists rather than to create one.
// Repairing them here is what makes the example runnable end to end.
//
// 1. ERROR 1075, "there can be only one auto column and it must be defined as a key". Only 3 of the
//    61 tables declare a primary key, so AUTO_INCREMENT columns are emitted without one. The real
//    Bangumi database has these keys; the drizzle module simply does not mention them.
// 2. ERROR 1064, at `entry_title` varchar NOT NULL. The htmlEscapedString customType returns the
//    bare string "varchar" from dataType(), with no length. That is fine for reading an existing
//    column and invalid as DDL.

const AUTO_INCREMENT_COLUMN = /^(?<definition>.*\bAUTO_INCREMENT\b.*?)(?<comma>,?)$/;
const LENGTHLESS_VARCHAR = /\bvarchar\b(?!\s*\()/g;

const VARCHAR_REPAIR_LENGTH = 255;

const declaresPrimaryKey = (statement: string): boolean => statement.includes('PRIMARY KEY');

// Whole statements, not lines: the three tables that do declare a key declare it on a trailing
// CONSTRAINT line, which a line at a time cannot see. Appending a second key is ER_MULTIPLE_PRI_KEY.
const withPrimaryKey = (statement: string): string => {
  if (declaresPrimaryKey(statement)) return statement;
  return statement
    .split('\n')
    .map((line) => {
      const match = AUTO_INCREMENT_COLUMN.exec(line.trimEnd());
      if (!match?.groups) return line;
      return `${match.groups.definition} PRIMARY KEY${match.groups.comma}`;
    })
    .join('\n');
};

const withVarcharLengths = (statement: string): string =>
  statement.replace(LENGTHLESS_VARCHAR, `varchar(${VARCHAR_REPAIR_LENGTH})`);

export const repairStatement = (statement: string): string => withVarcharLengths(withPrimaryKey(statement));

export const repairDdl = (statements: readonly string[]): string => statements.map(repairStatement).join('\n');
