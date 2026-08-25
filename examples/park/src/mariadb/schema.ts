import type { AnyMySqlColumn } from 'drizzle-orm/mysql-core';
import { bigint, boolean, date, double, int, json, mysqlEnum, mysqlTable, text, varchar } from 'drizzle-orm/mysql-core';

// The same park domain as src/postgres/schema.ts, expressed in mysql-core. One drizzle schema
// module cannot serve two dialects — the table constructors differ, and drizzle-super-seed
// rejects a mixed module — so each dialect declares the domain itself. MySQL has no uuid type
// and no GENERATED ALWAYS AS IDENTITY, so the keys are AUTO_INCREMENT integers throughout.
export const parks = mysqlTable('parks', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 120 }).notNull(),
  region: varchar('region', { length: 40 }).notNull(),
  openedAt: date('opened_at', { mode: 'string' }).notNull(),
  latitude: double('latitude'),
  amenities: json('amenities'),
  active: boolean('active').notNull().default(true),
});

export const pitches = mysqlTable('pitches', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  parkId: int('park_id')
    .notNull()
    .references(() => parks.id),
  reference: varchar('reference', { length: 20 }).notNull(),
  monthlyFee: varchar('monthly_fee', { length: 12 }).notNull(),
});

export const owners = mysqlTable('owners', {
  id: int('id').primaryKey().autoincrement(),
  fullName: varchar('full_name', { length: 200 }).notNull(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  memberSince: date('member_since', { mode: 'string' }).notNull(),
  referredByOwnerId: int('referred_by_owner_id').references((): AnyMySqlColumn => owners.id),
});

export const holidayHomes = mysqlTable('holiday_homes', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  pitchId: bigint('pitch_id', { mode: 'number' })
    .notNull()
    .references(() => pitches.id),
  ownerId: int('owner_id')
    .notNull()
    .references(() => owners.id),
  model: text('model').notNull(),
});

export const lettings = mysqlTable('lettings', {
  id: int('id').primaryKey().autoincrement(),
  holidayHomeId: bigint('holiday_home_id', { mode: 'number' })
    .notNull()
    .references(() => holidayHomes.id),
  guestName: varchar('guest_name', { length: 200 }).notNull(),
  status: mysqlEnum('status', ['pending', 'confirmed', 'cancelled']).notNull().default('pending'),
  startDate: date('start_date', { mode: 'string' }).notNull(),
  cleaningFee: varchar('cleaning_fee', { length: 12 }).notNull(),
});
