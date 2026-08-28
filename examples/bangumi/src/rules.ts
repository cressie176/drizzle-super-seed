// Bangumi's schema is 548 columns, of which only the 65 customType ones need a decision. The other
// 483 accept the derived default, but they still have to say so: a column with no rule is a
// MissingColumnRuleError, deliberately, so that adding a column to the schema cannot silently start
// producing data for it.
//
// Writing 548 rules by hand is not sensible, so this example takes the dynamic path: it reads the
// canonical schema and builds the rules object from it. The trade-off is real and worth stating.
// The typed path, SchemaRules over your schema module, makes a new table or column a compile-time
// error; building rules from a loop gives that up, because the loop absorbs whatever it is handed.
// Use the typed path for a schema you own. This one belongs to somebody else and arrives by fetch.
import { pickFrom, randomWords, structuralDefault } from 'drizzle-super-seed';
import type { CanonicalColumn, CanonicalSchema, ValueGenerator } from 'drizzle-super-seed';

// customType hides the JavaScript representation from drizzle's runtime, so structuralDefault has
// nothing to derive from and the library refuses to guess. What it does expose is the wrapped SQL
// type, which is enough to dispatch on.
//
// Sinks never call a customType's toDriver: they encode a custom value by its JavaScript type, each
// in its own conventions, so a boolean reaches MariaDB as 1 and PostgreSQL as t. That means a rule
// can return the natural value and stay sink-unaware. The tinyint columns below use 0 and 1 because
// that is what the column stores and it reads plainly, not because a boolean would fail.
type CustomGenerator = () => ValueGenerator<number> | ValueGenerator<string>;

const byWrappedSqlType = new Map<string, CustomGenerator>([
  ['tinyint', () => pickFrom([0, 1])],
  ['mediumblob', () => randomWords({ minLength: 8, maxLength: 24 })],
  ['varchar', () => randomWords({ minLength: 4, maxLength: 30 })],
  ['text', () => randomWords({ minLength: 8, maxLength: 60 })],
  ['mediumtext', () => randomWords({ minLength: 8, maxLength: 60 })],
]);

const unwrappable = (column: CanonicalColumn): never => {
  throw new Error(`No rule for customType ${column.customType} on column ${column.name}`);
};

const customValue = (column: CanonicalColumn): unknown =>
  (byWrappedSqlType.get(column.customType ?? '') ?? (() => unwrappable(column)))();

const ruleFor = (column: CanonicalColumn): unknown =>
  column.kind === 'Custom' ? customValue(column) : structuralDefault;

export const buildRules = (canonical: CanonicalSchema): Record<string, Record<string, unknown>> => {
  const rules: Record<string, Record<string, unknown>> = {};
  for (const [key, table] of canonical.tables) {
    rules[key] = {};
    for (const column of table.columns) rules[key][column.propertyName] = ruleFor(column);
  }
  return rules;
};
