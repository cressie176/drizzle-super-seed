const { blob, integer, primaryKey, real, sqliteTable, text, unique } = require('drizzle-orm/sqlite-core');

const parks = sqliteTable('parks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name', { length: 120 }).notNull(),
  region: text('region', { length: 40 }).notNull(),
  openedAt: integer('opened_at', { mode: 'timestamp' }).notNull(),
  latitude: real('latitude'),
  amenities: text('amenities', { mode: 'json' }),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

const pitches = sqliteTable('pitches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  parkId: integer('park_id')
    .notNull()
    .references(() => parks.id),
  reference: text('reference', { length: 20 }).notNull(),
  areaSqm: real('area_sqm'),
  hasElectricity: integer('has_electricity', { mode: 'boolean' }).notNull().default(false),
});

const owners = sqliteTable('owners', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fullName: text('full_name', { length: 200 }).notNull(),
  email: text('email', { length: 320 }).notNull().unique(),
  memberSince: integer('member_since', { mode: 'timestamp' }).notNull(),
  loyaltyPoints: blob('loyalty_points', { mode: 'bigint' }),
  referredByOwnerId: integer('referred_by_owner_id').references(() => owners.id),
});

const holidayHomes = sqliteTable('holiday_homes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pitchId: integer('pitch_id')
    .notNull()
    .references(() => pitches.id),
  ownerId: integer('owner_id')
    .notNull()
    .references(() => owners.id),
  model: text('model').notNull(),
  purchasePrice: text('purchase_price'),
  specification: text('specification', { mode: 'json' }),
  inspectedAt: integer('inspected_at', { mode: 'timestamp' }),
});

const lettings = sqliteTable(
  'lettings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    holidayHomeId: integer('holiday_home_id')
      .notNull()
      .references(() => holidayHomes.id),
    guestName: text('guest_name', { length: 200 }).notNull(),
    status: text('status', { length: 20 }).notNull().default('pending'),
    startDate: integer('start_date', { mode: 'timestamp' }).notNull(),
    siteFee: real('site_fee').notNull(),
    notes: text('notes'),
  },
  (table) => [unique('lettings_holiday_home_id_start_date_key').on(table.holidayHomeId, table.startDate)],
);

const parkOwners = sqliteTable(
  'park_owners',
  {
    parkId: integer('park_id')
      .notNull()
      .references(() => parks.id),
    ownerId: integer('owner_id')
      .notNull()
      .references(() => owners.id),
  },
  (table) => [primaryKey({ columns: [table.parkId, table.ownerId] })],
);

module.exports = { parks, pitches, owners, holidayHomes, lettings, parkOwners };
