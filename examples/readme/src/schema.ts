import { relations } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  bigserial,
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  uuid,
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
});

export const pitches = pgTable('pitches', {
  id: serial('id').primaryKey(),
  parkId: integer('park_id')
    .notNull()
    .references(() => parks.id),
  reference: varchar('reference', { length: 20 }).notNull(),
  monthlyFee: numeric('monthly_fee', { precision: 8, scale: 2 }).notNull(),
});

export const owners = pgTable('owners', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: varchar('full_name', { length: 200 }).notNull(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  memberSince: date('member_since').notNull(),
  referredByOwnerId: uuid('referred_by_owner_id').references((): AnyPgColumn => owners.id),
});

export const holidayHomes = pgTable('holiday_homes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  pitchId: integer('pitch_id')
    .notNull()
    .references(() => pitches.id),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => owners.id),
  model: text('model').notNull(),
});

export const lettings = pgTable('lettings', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  holidayHomeId: bigserial('holiday_home_id', { mode: 'number' })
    .notNull()
    .references(() => holidayHomes.id),
  guestName: varchar('guest_name', { length: 200 }).notNull(),
  status: lettingStatus('status').notNull().default('pending'),
  startDate: date('start_date').notNull(),
  cleaningFee: numeric('cleaning_fee', { precision: 8, scale: 2 }).notNull(),
});

export const parkRelations = relations(parks, ({ many }) => ({ pitches: many(pitches) }));

export const pitchRelations = relations(pitches, ({ one, many }) => ({
  park: one(parks, { fields: [pitches.parkId], references: [parks.id] }),
  holidayHomes: many(holidayHomes),
}));

export const ownerRelations = relations(owners, ({ many }) => ({ holidayHomes: many(holidayHomes) }));

export const holidayHomeRelations = relations(holidayHomes, ({ one, many }) => ({
  pitch: one(pitches, { fields: [holidayHomes.pitchId], references: [pitches.id] }),
  owner: one(owners, { fields: [holidayHomes.ownerId], references: [owners.id] }),
  lettings: many(lettings),
}));

export const lettingRelations = relations(lettings, ({ one }) => ({
  holidayHome: one(holidayHomes, { fields: [lettings.holidayHomeId], references: [holidayHomes.id] }),
}));
