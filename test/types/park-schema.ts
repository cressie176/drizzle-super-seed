import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const lettingStatus = pgEnum('letting_status', ['pending', 'confirmed', 'cancelled']);

export const parks = pgTable('parks', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: varchar('name', { length: 120 }).notNull(),
  region: varchar('region', { length: 40 }).notNull(),
  openedAt: date('opened_at').notNull(),
  latitude: doublePrecision('latitude'),
  amenities: jsonb('amenities'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pitches = pgTable('pitches', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  parkId: integer('park_id')
    .notNull()
    .references(() => parks.id),
  reference: varchar('reference', { length: 20 }).notNull(),
  areaSqm: real('area_sqm'),
  hasElectricity: boolean('has_electricity').notNull().default(false),
});

export const parkRelations = relations(parks, ({ many }) => ({ pitches: many(pitches) }));

export const pitchRelations = relations(pitches, ({ one }) => ({
  park: one(parks, { fields: [pitches.parkId], references: [parks.id] }),
}));
