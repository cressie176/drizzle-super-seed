// A .mts fixture resolves its imports the way an ESM consumer on NodeNext does: drizzle's
// `.d.ts` declarations rather than the `.d.cts` ones this CommonJS package otherwise sees.
// Constraining `SchemaRules` on drizzle's `Table` filtered every table out under that
// resolution, leaving `{}` — which accepts any rules object at all, silently.
import { relations } from 'drizzle-orm';
import { integer, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';
import { structuralDefault, type SchemaRules } from 'drizzle-super-seed';

const region = pgEnum('region', ['north', 'south']);

const parks = pgTable('parks', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
});

const pitches = pgTable('pitches', {
  id: integer('id').primaryKey(),
  parkId: integer('park_id')
    .notNull()
    .references(() => parks.id),
});

const parkRelations = relations(parks, ({ many }) => ({ pitches: many(pitches) }));

// The enum and the relations belong in a real schema module and must not become required keys.
const schema = { parks, pitches, region, parkRelations };

export const complete = {
  parks: { id: structuralDefault, name: structuralDefault },
  pitches: { id: structuralDefault, parkId: structuralDefault },
} satisfies SchemaRules<typeof schema>;

export const missingColumn = {
  // @ts-expect-error `name` has no rule
  parks: { id: structuralDefault },
  pitches: { id: structuralDefault, parkId: structuralDefault },
} satisfies SchemaRules<typeof schema>;

export const unknownColumn = {
  parks: {
    id: structuralDefault,
    name: structuralDefault,
    // @ts-expect-error `nope` is not a column of `parks`
    nope: structuralDefault,
  },
  pitches: { id: structuralDefault, parkId: structuralDefault },
} satisfies SchemaRules<typeof schema>;
