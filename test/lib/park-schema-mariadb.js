const {
  bigint,
  boolean,
  datetime,
  decimal,
  double,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  serial,
  smallint,
  text,
  time,
  unique,
  varchar,
} = require('drizzle-orm/mysql-core');

const parks = mysqlTable('parks', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 120 }).notNull(),
  region: varchar('region', { length: 40 }).notNull(),
  openedAt: datetime('opened_at').notNull(),
  latitude: double('latitude'),
  amenities: json('amenities'),
  active: boolean('active').notNull().default(true),
});

const pitches = mysqlTable('pitches', {
  id: serial('id').primaryKey(),
  parkId: int('park_id')
    .notNull()
    .references(() => parks.id),
  reference: varchar('reference', { length: 20 }).notNull(),
  areaSqm: double('area_sqm'),
  hasElectricity: boolean('has_electricity').notNull().default(false),
});

const owners = mysqlTable('owners', {
  id: int('id').primaryKey().autoincrement(),
  fullName: varchar('full_name', { length: 200 }).notNull(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  memberSince: datetime('member_since').notNull(),
  loyaltyPoints: bigint('loyalty_points', { mode: 'number' }).notNull().default(0),
  referredByOwnerId: int('referred_by_owner_id').references(() => owners.id),
});

const holidayHomes = mysqlTable('holiday_homes', {
  id: serial('id').primaryKey(),
  pitchId: bigint('pitch_id', { mode: 'number' })
    .notNull()
    .references(() => pitches.id),
  ownerId: int('owner_id')
    .notNull()
    .references(() => owners.id),
  model: text('model').notNull(),
  purchasePrice: decimal('purchase_price', { precision: 10, scale: 2 }),
  specification: json('specification'),
  inspectedAt: datetime('inspected_at'),
});

const accessories = mysqlTable('accessories', {
  id: int('id').primaryKey().autoincrement(),
  holidayHomeId: bigint('holiday_home_id', { mode: 'number' })
    .notNull()
    .references(() => holidayHomes.id),
  description: text('description').notNull(),
  quantity: smallint('quantity').notNull().default(1),
});

const lettings = mysqlTable(
  'lettings',
  {
    id: int('id').primaryKey().autoincrement(),
    holidayHomeId: bigint('holiday_home_id', { mode: 'number' })
      .notNull()
      .references(() => holidayHomes.id),
    guestName: varchar('guest_name', { length: 200 }).notNull(),
    status: mysqlEnum('status', ['pending', 'confirmed', 'cancelled']).notNull().default('pending'),
    startDate: datetime('start_date').notNull(),
    arrivalTime: time('arrival_time').notNull(),
    siteFee: decimal('site_fee', { precision: 8, scale: 2 }).notNull(),
    notes: text('notes'),
  },
  (table) => [unique('lettings_holiday_home_id_start_date_key').on(table.holidayHomeId, table.startDate)],
);

const parkOwners = mysqlTable(
  'park_owners',
  {
    parkId: int('park_id')
      .notNull()
      .references(() => parks.id),
    ownerId: int('owner_id')
      .notNull()
      .references(() => owners.id),
  },
  (table) => [primaryKey({ columns: [table.parkId, table.ownerId] })],
);

module.exports = { parks, pitches, owners, holidayHomes, accessories, lettings, parkOwners };
