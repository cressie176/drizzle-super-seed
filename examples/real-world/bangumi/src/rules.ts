// Bangumi's schema is 548 columns, of which only the 65 customType ones need a decision. The
// `[structuralDefaults]: true` annotation covers the other 483: the table says once that anything
// it does not name takes the derived default, instead of repeating that 483 times.
//
// The tables are still enumerated from the canonical schema rather than written out, because this
// schema belongs to somebody else and arrives by fetch, so there is nothing to keep in step with.
// For a schema you own, write the rules object out and let SchemaRules make a new table or column
// a compile-time error.
import { pickFrom, randomWords, structuralDefaults } from 'drizzle-super-seed';
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

// Only the customType columns need naming. Everything else is covered by the annotation, so this
// builds 65 rules rather than 548, and each one is a decision rather than boilerplate.
export const buildRules = (canonical: CanonicalSchema): Record<string, Record<string, unknown>> => {
  const rules: Record<string, Record<string, unknown>> = {};
  for (const [key, table] of canonical.tables) {
    rules[key] = { [structuralDefaults]: true };
    for (const column of table.columns) {
      if (column.kind !== 'Custom') continue;
      rules[key][column.propertyName] = customValue(column);
    }
  }
  return rules;
};
