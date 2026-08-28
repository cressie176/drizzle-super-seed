// LobeChat is 165 tables and 2228 columns, and 54 of those columns are an actual decision. The
// `[structuralDefaults]: true` annotation is what makes that ratio expressible: each table says
// once that anything it does not name takes the derived default.
//
// What is notable is how few exceptions there are. Arrays and vectors take the structural default
// like everything else. The named ones are the members of the five composite foreign keys, which
// cannot be picked independently (src/composite-keys.ts), the columns under a CHECK constraint,
// which the canonical schema cannot interpret (src/check-constraints.ts), one vector populated
// deliberately, and one foreign key narrower than what it references (src/narrow-references.ts).
//
// The tables are enumerated from the canonical schema rather than written out, because this schema
// belongs to somebody else and arrives by fetch. For a schema you own, write the rules object out
// and let SchemaRules make a new table or column a compile-time error.
import { randomVector, structuralDefaults } from 'drizzle-super-seed';
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
  for (const key of canonical.tables.keys()) {
    const overrides = {
      ...(compositeKeyRules[key] ?? {}),
      ...(checkConstraintRules[key] ?? {}),
      ...(vectorRules[key] ?? {}),
      ...(narrowReferenceRules[key] ?? {}),
    };
    rules[key] = { [structuralDefaults]: true, ...overrides };
  }
  return rules;
};
