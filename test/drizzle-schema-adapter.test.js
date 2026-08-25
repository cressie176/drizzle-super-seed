const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, throws } = require('node:assert');
const { relations } = require('drizzle-orm');
const {
  bigint,
  bigserial,
  date,
  foreignKey,
  integer,
  interval,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  varchar,
} = require('drizzle-orm/pg-core');
const { ColumnKind, IdentifierCasing, extractCanonicalSchema } = require('../lib');
const parkSchema = require('./lib/park-schema');

const SMALLINT_MAX = 32_767;
const INTEGER_MAX = 2_147_483_647;
const BIGINT_53_MAX = Number.MAX_SAFE_INTEGER;

const column = (fields) => ({
  notNull: false,
  hasDatabaseDefault: false,
  isPrimaryKey: false,
  sequenceOwned: false,
  identityAlways: false,
  ...fields,
});

const references = (columnName, referencedTableKey, referencedColumnName) => ({
  columnName,
  referencedTableKey,
  referencedColumnName,
});

const table = (key, name, columns, { primaryKey, foreignKeys = [], uniqueConstraints = [] }) => [
  key,
  {
    key,
    name,
    columns,
    primaryKey,
    foreignKeys,
    uniqueConstraints,
    drizzleTable: parkSchema[key],
  },
];

const expectedParkSchema = new Map([
  table(
    'parks',
    'parks',
    [
      column({
        name: 'id',
        propertyName: 'id',
        kind: ColumnKind.Integer,
        jsType: 'number',
        maxValue: INTEGER_MAX,
        notNull: true,
        hasDatabaseDefault: true,
        isPrimaryKey: true,
        sequenceOwned: true,
        identityAlways: true,
      }),
      column({
        name: 'name',
        propertyName: 'name',
        kind: ColumnKind.Text,
        jsType: 'string',
        notNull: true,
        maxLength: 120,
      }),
      column({
        name: 'region',
        propertyName: 'region',
        kind: ColumnKind.Text,
        jsType: 'string',
        notNull: true,
        maxLength: 40,
      }),
      column({ name: 'opened_at', propertyName: 'openedAt', kind: ColumnKind.Date, jsType: 'string', notNull: true }),
      column({ name: 'latitude', propertyName: 'latitude', kind: ColumnKind.Real, jsType: 'number' }),
      column({ name: 'amenities', propertyName: 'amenities', kind: ColumnKind.Json, jsType: 'json' }),
      column({
        name: 'active',
        propertyName: 'active',
        kind: ColumnKind.Boolean,
        jsType: 'boolean',
        notNull: true,
        hasDatabaseDefault: true,
      }),
      column({
        name: 'created_at',
        propertyName: 'createdAt',
        kind: ColumnKind.Timestamp,
        jsType: 'date',
        notNull: true,
        hasDatabaseDefault: true,
        withTimezone: true,
      }),
    ],
    { primaryKey: ['id'] },
  ),
  table(
    'pitches',
    'pitches',
    [
      column({
        name: 'id',
        propertyName: 'id',
        kind: ColumnKind.Integer,
        jsType: 'number',
        maxValue: INTEGER_MAX,
        notNull: true,
        hasDatabaseDefault: true,
        isPrimaryKey: true,
        sequenceOwned: true,
      }),
      column({
        name: 'park_id',
        propertyName: 'parkId',
        kind: ColumnKind.Integer,
        jsType: 'number',
        maxValue: INTEGER_MAX,
        notNull: true,
      }),
      column({
        name: 'reference',
        propertyName: 'reference',
        kind: ColumnKind.Text,
        jsType: 'string',
        notNull: true,
        maxLength: 20,
      }),
      column({ name: 'area_sqm', propertyName: 'areaSqm', kind: ColumnKind.Real, jsType: 'number' }),
      column({
        name: 'has_electricity',
        propertyName: 'hasElectricity',
        kind: ColumnKind.Boolean,
        jsType: 'boolean',
        notNull: true,
        hasDatabaseDefault: true,
      }),
    ],
    { primaryKey: ['id'], foreignKeys: [references('park_id', 'parks', 'id')] },
  ),
  table(
    'owners',
    'owners',
    [
      column({
        name: 'id',
        propertyName: 'id',
        kind: ColumnKind.Uuid,
        jsType: 'string',
        notNull: true,
        hasDatabaseDefault: true,
        isPrimaryKey: true,
      }),
      column({
        name: 'full_name',
        propertyName: 'fullName',
        kind: ColumnKind.Text,
        jsType: 'string',
        notNull: true,
        maxLength: 200,
      }),
      column({
        name: 'email',
        propertyName: 'email',
        kind: ColumnKind.Text,
        jsType: 'string',
        notNull: true,
        maxLength: 320,
      }),
      column({
        name: 'member_since',
        propertyName: 'memberSince',
        kind: ColumnKind.Date,
        jsType: 'string',
        notNull: true,
      }),
      column({
        name: 'loyalty_points',
        propertyName: 'loyaltyPoints',
        kind: ColumnKind.BigInt,
        jsType: 'number',
        maxValue: BIGINT_53_MAX,
        notNull: true,
        hasDatabaseDefault: true,
      }),
      column({
        name: 'referred_by_owner_id',
        propertyName: 'referredByOwnerId',
        kind: ColumnKind.Uuid,
        jsType: 'string',
      }),
    ],
    {
      primaryKey: ['id'],
      foreignKeys: [references('referred_by_owner_id', 'owners', 'id')],
      uniqueConstraints: [['email']],
    },
  ),
  table(
    'holidayHomes',
    'holiday_homes',
    [
      column({
        name: 'id',
        propertyName: 'id',
        kind: ColumnKind.BigInt,
        jsType: 'number',
        maxValue: BIGINT_53_MAX,
        notNull: true,
        hasDatabaseDefault: true,
        isPrimaryKey: true,
        sequenceOwned: true,
      }),
      column({
        name: 'pitch_id',
        propertyName: 'pitchId',
        kind: ColumnKind.Integer,
        jsType: 'number',
        maxValue: INTEGER_MAX,
        notNull: true,
      }),
      column({ name: 'owner_id', propertyName: 'ownerId', kind: ColumnKind.Uuid, jsType: 'string', notNull: true }),
      column({ name: 'previous_owner_id', propertyName: 'previousOwnerId', kind: ColumnKind.Uuid, jsType: 'string' }),
      column({ name: 'model', propertyName: 'model', kind: ColumnKind.Text, jsType: 'string', notNull: true }),
      column({
        name: 'purchase_price',
        propertyName: 'purchasePrice',
        kind: ColumnKind.Decimal,
        jsType: 'string',
        precision: 10,
        scale: 2,
      }),
      column({ name: 'specification', propertyName: 'specification', kind: ColumnKind.Json, jsType: 'json' }),
      column({
        name: 'inspected_at',
        propertyName: 'inspectedAt',
        kind: ColumnKind.Timestamp,
        jsType: 'date',
        withTimezone: false,
      }),
    ],
    {
      primaryKey: ['id'],
      foreignKeys: [
        references('pitch_id', 'pitches', 'id'),
        references('owner_id', 'owners', 'id'),
        references('previous_owner_id', 'owners', 'id'),
      ],
    },
  ),
  table(
    'accessories',
    'accessories',
    [
      column({
        name: 'id',
        propertyName: 'id',
        kind: ColumnKind.Integer,
        jsType: 'number',
        maxValue: INTEGER_MAX,
        notNull: true,
        hasDatabaseDefault: true,
        isPrimaryKey: true,
        sequenceOwned: true,
      }),
      column({
        name: 'holiday_home_id',
        propertyName: 'holidayHomeId',
        kind: ColumnKind.BigInt,
        jsType: 'number',
        maxValue: BIGINT_53_MAX,
        notNull: true,
      }),
      column({
        name: 'description',
        propertyName: 'description',
        kind: ColumnKind.Text,
        jsType: 'string',
        notNull: true,
      }),
      column({
        name: 'quantity',
        propertyName: 'quantity',
        kind: ColumnKind.Integer,
        jsType: 'number',
        maxValue: SMALLINT_MAX,
        notNull: true,
        hasDatabaseDefault: true,
      }),
    ],
    { primaryKey: ['id'], foreignKeys: [references('holiday_home_id', 'holidayHomes', 'id')] },
  ),
  table(
    'lettings',
    'lettings',
    [
      column({
        name: 'id',
        propertyName: 'id',
        kind: ColumnKind.Integer,
        jsType: 'number',
        maxValue: INTEGER_MAX,
        notNull: true,
        hasDatabaseDefault: true,
        isPrimaryKey: true,
        sequenceOwned: true,
        identityAlways: true,
      }),
      column({
        name: 'holiday_home_id',
        propertyName: 'holidayHomeId',
        kind: ColumnKind.BigInt,
        jsType: 'number',
        maxValue: BIGINT_53_MAX,
        notNull: true,
      }),
      column({
        name: 'guest_name',
        propertyName: 'guestName',
        kind: ColumnKind.Text,
        jsType: 'string',
        notNull: true,
        maxLength: 200,
      }),
      column({
        name: 'status',
        propertyName: 'status',
        kind: ColumnKind.Enum,
        jsType: 'string',
        notNull: true,
        hasDatabaseDefault: true,
        enumValues: ['pending', 'confirmed', 'cancelled'],
      }),
      column({ name: 'start_date', propertyName: 'startDate', kind: ColumnKind.Date, jsType: 'string', notNull: true }),
      column({ name: 'end_date', propertyName: 'endDate', kind: ColumnKind.Date, jsType: 'string', notNull: true }),
      column({
        name: 'arrival_time',
        propertyName: 'arrivalTime',
        kind: ColumnKind.Time,
        jsType: 'string',
        notNull: true,
      }),
      column({
        name: 'site_fee',
        propertyName: 'siteFee',
        kind: ColumnKind.Decimal,
        jsType: 'string',
        notNull: true,
        precision: 8,
        scale: 2,
      }),
      column({ name: 'notes', propertyName: 'notes', kind: ColumnKind.Text, jsType: 'string' }),
    ],
    {
      primaryKey: ['id'],
      foreignKeys: [references('holiday_home_id', 'holidayHomes', 'id')],
      uniqueConstraints: [['holiday_home_id', 'start_date']],
    },
  ),
  table(
    'parkOwners',
    'park_owners',
    [
      column({
        name: 'park_id',
        propertyName: 'parkId',
        kind: ColumnKind.Integer,
        jsType: 'number',
        maxValue: INTEGER_MAX,
        notNull: true,
      }),
      column({ name: 'owner_id', propertyName: 'ownerId', kind: ColumnKind.Uuid, jsType: 'string', notNull: true }),
    ],
    {
      primaryKey: ['park_id', 'owner_id'],
      foreignKeys: [references('park_id', 'parks', 'id'), references('owner_id', 'owners', 'id')],
    },
  ),
]);

const namesOf = (canonical, key) => canonical.tables.get(key).columns.map((each) => each.name);

describe('drizzle schema adapter', () => {
  describe('the park schema', () => {
    it('extracts every table and column exactly', () => {
      deq(extractCanonicalSchema(parkSchema), { tables: expectedParkSchema });
    });
  });

  describe('javascript representations', () => {
    const everyMode = pgTable('every_mode', {
      id: integer('id').primaryKey(),
      dateAsString: date('date_as_string'),
      dateAsDate: date('date_as_date', { mode: 'date' }),
      timestampAsDate: timestamp('timestamp_as_date'),
      timestampAsString: timestamp('timestamp_as_string', { mode: 'string' }),
      numericAsString: numeric('numeric_as_string'),
      numericAsNumber: numeric('numeric_as_number', { mode: 'number' }),
      numericAsBigInt: numeric('numeric_as_big_int', { mode: 'bigint' }),
      bigIntAsNumber: bigint('big_int_as_number', { mode: 'number' }),
      bigIntAsBigInt: bigint('big_int_as_big_int', { mode: 'bigint' }),
      bigSerialAsBigInt: bigserial('big_serial_as_big_int', { mode: 'bigint' }),
    });

    const representationOf = (propertyName) => {
      const column = extractCanonicalSchema({ everyMode })
        .tables.get('everyMode')
        .columns.find((each) => each.propertyName === propertyName);
      return [column.kind, column.jsType];
    };

    it('records which representation a date column inserts', () => {
      deq(representationOf('dateAsString'), [ColumnKind.Date, 'string']);
      deq(representationOf('dateAsDate'), [ColumnKind.Date, 'date']);
    });

    it('records which representation a timestamp column inserts', () => {
      deq(representationOf('timestampAsDate'), [ColumnKind.Timestamp, 'date']);
      deq(representationOf('timestampAsString'), [ColumnKind.Timestamp, 'string']);
    });

    it('records which representation a numeric column inserts', () => {
      deq(representationOf('numericAsString'), [ColumnKind.Decimal, 'string']);
      deq(representationOf('numericAsNumber'), [ColumnKind.Decimal, 'number']);
      deq(representationOf('numericAsBigInt'), [ColumnKind.Decimal, 'bigint']);
    });

    it('records which representation a bigint column inserts', () => {
      deq(representationOf('bigIntAsNumber'), [ColumnKind.BigInt, 'number']);
      deq(representationOf('bigIntAsBigInt'), [ColumnKind.BigInt, 'bigint']);
      deq(representationOf('bigSerialAsBigInt'), [ColumnKind.BigInt, 'bigint']);
    });
  });

  describe('value ranges', () => {
    const rangeProbe = pgTable('range_probe', {
      id: integer('id').primaryKey(),
      small: smallint('small'),
      big: bigint('big', { mode: 'number' }),
      bigger: bigint('bigger', { mode: 'bigint' }),
      description: text('description'),
    });

    const largestValueOf = (propertyName) =>
      extractCanonicalSchema({ rangeProbe })
        .tables.get('rangeProbe')
        .columns.find((column) => column.propertyName === propertyName).maxValue;

    it('records the largest value each integer column type holds', () => {
      eq(largestValueOf('small'), 32_767);
      eq(largestValueOf('id'), 2_147_483_647);
    });

    it('records a bigint column largest value in the representation it inserts', () => {
      eq(largestValueOf('big'), Number.MAX_SAFE_INTEGER);
      eq(largestValueOf('bigger'), 9_223_372_036_854_775_807n);
    });

    it('records no largest value for a column which is not an integer', () => {
      eq(largestValueOf('description'), undefined);
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

  describe('keys and constraints', () => {
    const tableNamed = (key) => extractCanonicalSchema(parkSchema).tables.get(key);

    it('reads a single column primary key from the column which declares it', () => {
      deq(tableNamed('parks').primaryKey, ['id']);
    });

    it('reads a composite primary key from the table which declares it', () => {
      deq(tableNamed('parkOwners').primaryKey, ['park_id', 'owner_id']);
    });

    it('reads a single column unique constraint from the column which declares it', () => {
      deq(tableNamed('owners').uniqueConstraints, [['email']]);
    });

    it('reads a composite unique constraint from the table which declares it', () => {
      deq(tableNamed('lettings').uniqueConstraints, [['holiday_home_id', 'start_date']]);
    });

    it('distinguishes two foreign keys to the same table by their column', () => {
      deq(tableNamed('holidayHomes').foreignKeys, [
        references('pitch_id', 'pitches', 'id'),
        references('owner_id', 'owners', 'id'),
        references('previous_owner_id', 'owners', 'id'),
      ]);
    });

    it('resolves a self referencing foreign key to its own table', () => {
      deq(tableNamed('owners').foreignKeys, [references('referred_by_owner_id', 'owners', 'id')]);
    });
  });

  describe('identifier casing', () => {
    const camelCasedProperties = pgTable('casing_probe', {
      pitchId: integer().primaryKey(),
      ownerName: varchar({ length: 10 }),
      explicitlyNamed: integer('explicit_name'),
    });

    const snakeCasedProperties = pgTable('casing_probe', {
      pitch_id: integer().primaryKey(),
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

    it('names key and constraint columns as it names the columns themselves', () => {
      const seasons = pgTable(
        'seasons',
        {
          startYear: integer().notNull(),
          quarterNumber: integer().notNull(),
          quarterLabel: varchar({ length: 8 }).unique(),
        },
        (table) => [primaryKey({ columns: [table.startYear, table.quarterNumber] })],
      );
      const canonical = extractCanonicalSchema({ seasons }, { casing: IdentifierCasing.SnakeCase });
      deq(canonical.tables.get('seasons').primaryKey, ['start_year', 'quarter_number']);
      deq(canonical.tables.get('seasons').uniqueConstraints, [['quarter_label']]);
    });

    it('names foreign key columns as it names the columns themselves', () => {
      const parks = pgTable('parks', { parkId: integer().primaryKey() });
      const pitches = pgTable('pitches', {
        pitchId: integer().primaryKey(),
        parkId: integer().references(() => parks.parkId),
      });
      const canonical = extractCanonicalSchema({ parks, pitches }, { casing: IdentifierCasing.SnakeCase });
      deq(canonical.tables.get('pitches').foreignKeys, [references('park_id', 'parks', 'park_id')]);
    });

    it('keeps a declared table name verbatim, whatever the casing', () => {
      const holidayHomes = pgTable('holidayHomes', { pitchId: integer().primaryKey() });
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

  describe('unsupported relationships', () => {
    const seasons = pgTable(
      'seasons',
      { year: integer('year').notNull(), quarter: integer('quarter').notNull() },
      (table) => [primaryKey({ columns: [table.year, table.quarter] })],
    );

    const seasonBookings = pgTable(
      'season_bookings',
      {
        id: integer('id').primaryKey(),
        seasonYear: integer('season_year').notNull(),
        seasonQuarter: integer('season_quarter').notNull(),
      },
      (table) => [
        foreignKey({
          columns: [table.seasonYear, table.seasonQuarter],
          foreignColumns: [seasons.year, seasons.quarter],
        }),
      ],
    );

    it('rejects a composite foreign key, naming it as the schema declares it', () => {
      throws(() => extractCanonicalSchema({ seasons, seasonBookings }), {
        name: 'UnsupportedRelationshipError',
        message:
          'Table seasonBookings has a composite foreign key on columns seasonYear, seasonQuarter. ' +
          'Replace it with single column foreign keys, or leave the table out of the schema passed to generate.',
        table: 'seasonBookings',
        columns: ['seasonYear', 'seasonQuarter'],
      });
    });
  });

  describe('incomplete schemas', () => {
    it('rejects a foreign key to a table missing from the schema, naming the absent table as the database does', () => {
      throws(() => extractCanonicalSchema({ holidayHomes: parkSchema.holidayHomes }), {
        name: 'IncompleteSchemaError',
        message:
          'Column holidayHomes.pitchId references database table pitches, which is missing from the schema. ' +
          'Add the export which declares pitches to the schema passed to generate, or leave holidayHomes out of it.',
        table: 'holidayHomes',
        column: 'pitchId',
        referencedTable: 'pitches',
      });
    });
  });

  describe('missing primary keys', () => {
    it('rejects a table drizzle-super-seed cannot reference rows of, naming it as the schema declares it', () => {
      const auditEntries = pgTable('audit_entries', { note: integer('note') });
      throws(() => extractCanonicalSchema({ auditEntries }), {
        name: 'MissingPrimaryKeyError',
        message:
          'Table auditEntries has no primary key, which drizzle-super-seed needs to reference its rows. ' +
          'Give it one, or leave it out of the schema passed to generate.',
        table: 'auditEntries',
      });
    });
  });

  describe('unsupported column types', () => {
    it('rejects a column drizzle-super-seed cannot generate values for, naming it as the schema declares it', () => {
      const siteEvents = pgTable('site_events', { elapsed: interval('elapsed_time') });
      throws(() => extractCanonicalSchema({ siteEvents }), {
        name: 'UnsupportedColumnTypeError',
        message:
          'Column siteEvents.elapsed has unsupported drizzle column type PgInterval. ' +
          'Change it to a supported type, or leave its table out of the schema passed to generate.',
        table: 'siteEvents',
        column: 'elapsed',
        columnType: 'PgInterval',
      });
    });
  });
});
