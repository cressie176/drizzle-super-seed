// LobeChat is 165 tables and 2228 columns. Every column needs a rule, because a missing one is a
// MissingColumnRuleError by design, so this example builds the rules object from the canonical
// schema rather than by hand. The trade-off is the same one described in the Bangumi example: the
// typed path, SchemaRules over the schema module, would make a new table or column a compile time
// error, and a loop gives that up in exchange for not writing 2228 lines.
//
// What is notable here is how little else is needed. Every one of the 2228 columns takes the
// structural default, arrays and vectors included, with one exception: the members of the five
// composite foreign keys, which cannot be picked independently (src/composite-keys.ts), and the
// columns under a CHECK constraint, which the canonical schema cannot see (src/check-constraints.ts).
import { randomVector, structuralDefault } from 'drizzle-super-seed';
import type { CanonicalSchema } from 'drizzle-super-seed';
import { checkConstraintRules } from './check-constraints.ts';
import { compositeKeyRules } from './composite-keys.ts';
import { narrowReferenceRules } from './narrow-references.ts';

// Every vector column here is nullable, and a nullable vector takes null by default: there is no
// such thing as a meaningful random embedding, so the library does not invent one. When you do want
// a populated vector, randomVector generates one of the declared dimension.
const VECTOR_DIMENSIONS = 1024;

const vectorRules: Record<string, Record<string, unknown>> = {
  embeddings: { embeddings: randomVector(VECTOR_DIMENSIONS) },
};

export const buildRules = (canonical: CanonicalSchema): Record<string, Record<string, unknown>> => {
  const rules: Record<string, Record<string, unknown>> = {};
  for (const [key, table] of canonical.tables) {
    rules[key] = {};
    const overrides = {
      ...(compositeKeyRules[key] ?? {}),
      ...(checkConstraintRules[key] ?? {}),
      ...(vectorRules[key] ?? {}),
      ...(narrowReferenceRules[key] ?? {}),
    };
    for (const column of table.columns)
      rules[key][column.propertyName] = overrides[column.propertyName] ?? structuralDefault;
  }
  return rules;
};
