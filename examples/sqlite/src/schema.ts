import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// The same park domain, expressed in sqlite-core. SQLite has no uuid, enum or json types, so
// keys are rowid integers, statuses are plain text constrained by the rules, dates are
// integer-timestamp columns, and amenities are JSON-in-text.
export const parks = sqliteTable('parks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name', { length: 120 }).notNull(),
  region: text('region', { length: 40 }).notNull(),
  openedAt: integer('opened_at', { mode: 'timestamp' }).notNull(),
  latitude: real('latitude'),
  amenities: text('amenities', { mode: 'json' }),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

export const pitches = sqliteTable('pitches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  parkId: integer('park_id')
    .notNull()
    .references(() => parks.id),
  reference: text('reference', { length: 20 }).notNull(),
  monthlyFee: text('monthly_fee', { length: 12 }).notNull(),
});

export const owners = sqliteTable('owners', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fullName: text('full_name', { length: 200 }).notNull(),
  email: text('email', { length: 320 }).notNull().unique(),
  memberSince: integer('member_since', { mode: 'timestamp' }).notNull(),
  referredByOwnerId: integer('referred_by_owner_id').references((): AnySQLiteColumn => owners.id),
});

export const holidayHomes = sqliteTable('holiday_homes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pitchId: integer('pitch_id')
    .notNull()
    .references(() => pitches.id),
  ownerId: integer('owner_id')
    .notNull()
    .references(() => owners.id),
  model: text('model').notNull(),
});

export const lettings = sqliteTable('lettings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  holidayHomeId: integer('holiday_home_id')
    .notNull()
    .references(() => holidayHomes.id),
  guestName: text('guest_name', { length: 200 }).notNull(),
  status: text('status', { length: 20 }).notNull().default('pending'),
  startDate: integer('start_date', { mode: 'timestamp' }).notNull(),
  cleaningFee: text('cleaning_fee', { length: 12 }).notNull(),
});
