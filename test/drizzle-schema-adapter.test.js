const { describe, it } = require('node:test');
const { deepEqual: deq, throws } = require('node:assert');
const { relations } = require('drizzle-orm');
const { integer, interval, pgTable, varchar } = require('drizzle-orm/pg-core');
const { ColumnKind, IdentifierCasing, extractCanonicalSchema } = require('../lib');
const parkSchema = require('./lib/park-schema');

const column = (fields) => ({
  notNull: false,
  hasDatabaseDefault: false,
  isPrimaryKey: false,
  sequenceOwned: false,
  identityAlways: false,
  ...fields,
});

const table = (key, name, columns) => [
  key,
  {
    key,
    name,
    columns,
    primaryKey: [],
    foreignKeys: [],
    uniqueConstraints: [],
    drizzleTable: parkSchema[key],
  },
];

const expectedParkSchema = new Map([
  table('parks', 'parks', [
    column({
      name: 'id',
      propertyName: 'id',
      kind: ColumnKind.Integer,
      notNull: true,
      hasDatabaseDefault: true,
      isPrimaryKey: true,
      sequenceOwned: true,
      identityAlways: true,
    }),
    column({ name: 'name', propertyName: 'name', kind: ColumnKind.Text, notNull: true, maxLength: 120 }),
    column({ name: 'region', propertyName: 'region', kind: ColumnKind.Text, notNull: true, maxLength: 40 }),
    column({ name: 'opened_at', propertyName: 'openedAt', kind: ColumnKind.Date, notNull: true }),
    column({ name: 'latitude', propertyName: 'latitude', kind: ColumnKind.Real }),
    column({ name: 'amenities', propertyName: 'amenities', kind: ColumnKind.Json }),
    column({
      name: 'active',
      propertyName: 'active',
      kind: ColumnKind.Boolean,
      notNull: true,
      hasDatabaseDefault: true,
    }),
    column({
      name: 'created_at',
      propertyName: 'createdAt',
      kind: ColumnKind.Timestamp,
      notNull: true,
      hasDatabaseDefault: true,
      withTimezone: true,
    }),
  ]),
  table('pitches', 'pitches', [
    column({
      name: 'id',
      propertyName: 'id',
      kind: ColumnKind.Integer,
      notNull: true,
      hasDatabaseDefault: true,
      isPrimaryKey: true,
      sequenceOwned: true,
    }),
    column({ name: 'park_id', propertyName: 'parkId', kind: ColumnKind.Integer, notNull: true }),
    column({ name: 'reference', propertyName: 'reference', kind: ColumnKind.Text, notNull: true, maxLength: 20 }),
    column({ name: 'area_sqm', propertyName: 'areaSqm', kind: ColumnKind.Real }),
    column({
      name: 'has_electricity',
      propertyName: 'hasElectricity',
      kind: ColumnKind.Boolean,
      notNull: true,
      hasDatabaseDefault: true,
    }),
  ]),
  table('owners', 'owners', [
    column({
      name: 'id',
      propertyName: 'id',
      kind: ColumnKind.Uuid,
      notNull: true,
      hasDatabaseDefault: true,
      isPrimaryKey: true,
    }),
    column({ name: 'full_name', propertyName: 'fullName', kind: ColumnKind.Text, notNull: true, maxLength: 200 }),
    column({ name: 'email', propertyName: 'email', kind: ColumnKind.Text, notNull: true, maxLength: 320 }),
    column({ name: 'member_since', propertyName: 'memberSince', kind: ColumnKind.Date, notNull: true }),
    column({
      name: 'loyalty_points',
      propertyName: 'loyaltyPoints',
      kind: ColumnKind.BigInt,
      notNull: true,
      hasDatabaseDefault: true,
    }),
    column({ name: 'referred_by_owner_id', propertyName: 'referredByOwnerId', kind: ColumnKind.Uuid }),
  ]),
  table('holidayHomes', 'holiday_homes', [
    column({
      name: 'id',
      propertyName: 'id',
      kind: ColumnKind.BigInt,
      notNull: true,
      hasDatabaseDefault: true,
      isPrimaryKey: true,
      sequenceOwned: true,
    }),
    column({ name: 'pitch_id', propertyName: 'pitchId', kind: ColumnKind.Integer, notNull: true }),
    column({ name: 'owner_id', propertyName: 'ownerId', kind: ColumnKind.Uuid, notNull: true }),
    column({ name: 'previous_owner_id', propertyName: 'previousOwnerId', kind: ColumnKind.Uuid }),
    column({ name: 'model', propertyName: 'model', kind: ColumnKind.Text, notNull: true }),
    column({
      name: 'purchase_price',
      propertyName: 'purchasePrice',
      kind: ColumnKind.Decimal,
      precision: 10,
      scale: 2,
    }),
    column({ name: 'specification', propertyName: 'specification', kind: ColumnKind.Json }),
    column({ name: 'inspected_at', propertyName: 'inspectedAt', kind: ColumnKind.Timestamp, withTimezone: false }),
  ]),
  table('accessories', 'accessories', [
    column({
      name: 'id',
      propertyName: 'id',
      kind: ColumnKind.Integer,
      notNull: true,
      hasDatabaseDefault: true,
      isPrimaryKey: true,
      sequenceOwned: true,
    }),
    column({ name: 'holiday_home_id', propertyName: 'holidayHomeId', kind: ColumnKind.BigInt, notNull: true }),
    column({ name: 'description', propertyName: 'description', kind: ColumnKind.Text, notNull: true }),
    column({
      name: 'quantity',
      propertyName: 'quantity',
      kind: ColumnKind.Integer,
      notNull: true,
      hasDatabaseDefault: true,
    }),
  ]),
  table('lettings', 'lettings', [
    column({
      name: 'id',
      propertyName: 'id',
      kind: ColumnKind.Integer,
      notNull: true,
      hasDatabaseDefault: true,
      isPrimaryKey: true,
      sequenceOwned: true,
      identityAlways: true,
    }),
    column({ name: 'holiday_home_id', propertyName: 'holidayHomeId', kind: ColumnKind.BigInt, notNull: true }),
    column({ name: 'guest_name', propertyName: 'guestName', kind: ColumnKind.Text, notNull: true, maxLength: 200 }),
    column({
      name: 'status',
      propertyName: 'status',
      kind: ColumnKind.Enum,
      notNull: true,
      hasDatabaseDefault: true,
      enumValues: ['pending', 'confirmed', 'cancelled'],
    }),
    column({ name: 'start_date', propertyName: 'startDate', kind: ColumnKind.Date, notNull: true }),
    column({ name: 'end_date', propertyName: 'endDate', kind: ColumnKind.Date, notNull: true }),
    column({ name: 'arrival_time', propertyName: 'arrivalTime', kind: ColumnKind.Time, notNull: true }),
    column({
      name: 'site_fee',
      propertyName: 'siteFee',
      kind: ColumnKind.Decimal,
      notNull: true,
      precision: 8,
      scale: 2,
    }),
    column({ name: 'notes', propertyName: 'notes', kind: ColumnKind.Text }),
  ]),
  table('parkOwners', 'park_owners', [
    column({ name: 'park_id', propertyName: 'parkId', kind: ColumnKind.Integer, notNull: true }),
    column({ name: 'owner_id', propertyName: 'ownerId', kind: ColumnKind.Uuid, notNull: true }),
  ]),
]);

const namesOf = (canonical, key) => canonical.tables.get(key).columns.map((each) => each.name);

describe('drizzle schema adapter', () => {
  describe('the park schema', () => {
    it('extracts every table and column exactly', () => {
      deq(extractCanonicalSchema(parkSchema), { tables: expectedParkSchema });
    });
  });

  describe('sequence ownership', () => {
    const sequenceOwnership = (key) => {
      const [primary] = extractCanonicalSchema(parkSchema).tables.get(key).columns;
      return [primary.sequenceOwned, primary.identityAlways];
    };

    it('owns the sequence of a GENERATED ALWAYS AS IDENTITY column, which inserts must override', () => {
      deq(sequenceOwnership('parks'), [true, true]);
    });

    it('owns the sequence of a GENERATED BY DEFAULT AS IDENTITY column, which inserts need not override', () => {
      deq(sequenceOwnership('accessories'), [true, false]);
    });

    it('owns the sequence of serial and bigserial columns', () => {
      deq(sequenceOwnership('pitches'), [true, false]);
      deq(sequenceOwnership('holidayHomes'), [true, false]);
    });

    it('owns no sequence for a uuid key with a database default', () => {
      deq(sequenceOwnership('owners'), [false, false]);
    });
  });

  describe('identifier casing', () => {
    const camelCasedProperties = pgTable('casing_probe', {
      pitchId: integer(),
      ownerName: varchar({ length: 10 }),
      explicitlyNamed: integer('explicit_name'),
    });

    const snakeCasedProperties = pgTable('casing_probe', {
      pitch_id: integer(),
      explicitlyNamed: integer('explicitName'),
    });

    it('uses property names verbatim when no casing is configured', () => {
      const canonical = extractCanonicalSchema({ probe: camelCasedProperties });
      deq(namesOf(canonical, 'probe'), ['pitchId', 'ownerName', 'explicit_name']);
    });

    it('converts name-less columns to snake case', () => {
      const canonical = extractCanonicalSchema({ probe: camelCasedProperties }, { casing: IdentifierCasing.SnakeCase });
      deq(namesOf(canonical, 'probe'), ['pitch_id', 'owner_name', 'explicit_name']);
    });

    it('converts name-less columns to camel case', () => {
      const canonical = extractCanonicalSchema({ probe: snakeCasedProperties }, { casing: IdentifierCasing.CamelCase });
      deq(namesOf(canonical, 'probe'), ['pitchId', 'explicitName']);
    });

    it('keeps a declared table name verbatim, whatever the casing', () => {
      const holidayHomes = pgTable('holidayHomes', { pitchId: integer() });
      const canonical = extractCanonicalSchema({ holidayHomes }, { casing: IdentifierCasing.SnakeCase });
      deq(canonical.tables.get('holidayHomes').name, 'holidayHomes');
    });
  });

  describe('schema module exports', () => {
    it('ignores exports which are not tables', () => {
      const parkRelations = relations(parkSchema.parks, ({ many }) => ({ pitches: many(parkSchema.pitches) }));
      const schema = {
        parks: parkSchema.parks,
        lettingStatus: parkSchema.lettingStatus,
        parkRelations,
        version: 3,
      };
      deq([...extractCanonicalSchema(schema).tables.keys()], ['parks']);
    });
  });

  describe('unsupported column types', () => {
    it('rejects a column drizzle-super-seed cannot generate values for', () => {
      const events = pgTable('events', { duration: interval('duration') });
      throws(() => extractCanonicalSchema({ events }), {
        name: 'UnsupportedColumnTypeError',
        message:
          'Column events.duration has unsupported drizzle column type PgInterval. ' +
          'Change it to a supported type, or leave its table out of the schema passed to generate.',
        table: 'events',
        column: 'duration',
        columnType: 'PgInterval',
      });
    });
  });
});
