const {
  bigint,
  bigserial,
  boolean,
  date,
  doublePrecision,
  integer,
  json,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
  varchar,
} = require('drizzle-orm/pg-core');

const lettingStatus = pgEnum('letting_status', ['pending', 'confirmed', 'cancelled']);

const parks = pgTable('parks', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: varchar('name', { length: 120 }).notNull(),
  region: varchar('region', { length: 40 }).notNull(),
  openedAt: date('opened_at').notNull(),
  latitude: doublePrecision('latitude'),
  amenities: jsonb('amenities'),
  facilities: varchar('facilities', { length: 40 }).array(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  wardenId: integer('warden_id').references(() => staff.id),
});

const pitches = pgTable('pitches', {
  id: serial('id').primaryKey(),
  parkId: integer('park_id')
    .notNull()
    .references(() => parks.id),
  reference: varchar('reference', { length: 20 }).notNull(),
  areaSqm: real('area_sqm'),
  hasElectricity: boolean('has_electricity').notNull().default(false),
});

const owners = pgTable('owners', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: varchar('full_name', { length: 200 }).notNull(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  memberSince: date('member_since').notNull(),
  loyaltyPoints: bigint('loyalty_points', { mode: 'number' }).notNull().default(0),
  referredByOwnerId: uuid('referred_by_owner_id').references(() => owners.id),
});

const holidayHomes = pgTable('holiday_homes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  pitchId: integer('pitch_id')
    .notNull()
    .references(() => pitches.id),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => owners.id),
  previousOwnerId: uuid('previous_owner_id').references(() => owners.id),
  model: text('model').notNull(),
  purchasePrice: numeric('purchase_price', { precision: 10, scale: 2 }),
  specification: json('specification'),
  inspectedAt: timestamp('inspected_at'),
});

const accessories = pgTable('accessories', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  holidayHomeId: bigint('holiday_home_id', { mode: 'number' })
    .notNull()
    .references(() => holidayHomes.id),
  description: text('description').notNull(),
  quantity: smallint('quantity').notNull().default(1),
});

const lettings = pgTable(
  'lettings',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    holidayHomeId: bigint('holiday_home_id', { mode: 'number' })
      .notNull()
      .references(() => holidayHomes.id),
    guestName: varchar('guest_name', { length: 200 }).notNull(),
    status: lettingStatus('status').notNull().default('pending'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    arrivalTime: time('arrival_time').notNull(),
    siteFee: numeric('site_fee', { precision: 8, scale: 2 }).notNull(),
    notes: text('notes'),
  },
  (table) => [unique('lettings_holiday_home_id_start_date_key').on(table.holidayHomeId, table.startDate)],
);

const parkOwners = pgTable(
  'park_owners',
  {
    parkId: integer('park_id')
      .notNull()
      .references(() => parks.id),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => owners.id),
  },
  (table) => [primaryKey({ columns: [table.parkId, table.ownerId] })],
);

const staff = pgTable('staff', {
  id: serial('id').primaryKey(),
  parkId: integer('park_id')
    .notNull()
    .references(() => parks.id),
  fullName: varchar('full_name', { length: 200 }).notNull(),
});

module.exports = {
  lettingStatus,
  parks,
  pitches,
  owners,
  holidayHomes,
  accessories,
  lettings,
  parkOwners,
  staff,
};
