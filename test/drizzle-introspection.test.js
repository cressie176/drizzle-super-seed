const { describe, it } = require('node:test');
const { equal: eq, deepEqual: deq } = require('node:assert');
const { getTableColumns } = require('drizzle-orm');
const {
  bigint,
  bigserial,
  date,
  getTableConfig,
  integer,
  numeric,
  pgTable,
  timestamp,
  varchar,
} = require('drizzle-orm/pg-core');
const { toCamelCase, toSnakeCase } = require('drizzle-orm/casing');
const { lettingStatus, ...parkTables } = require('./lib/park-schema');

const columnTypesOf = (table) =>
  Object.values(getTableColumns(table)).map((column) => [column.name, column.columnType]);

const columnNamed = (table, propertyName) => getTableColumns(table)[propertyName];

describe('installed drizzle-orm introspection', () => {
  describe('column types', () => {
    it('reports the column type of every park column', () => {
      deq(columnTypesOf(parkTables.parks), [
        ['id', 'PgInteger'],
        ['name', 'PgVarchar'],
        ['region', 'PgVarchar'],
        ['opened_at', 'PgDateString'],
        ['latitude', 'PgDoublePrecision'],
        ['amenities', 'PgJsonb'],
        ['active', 'PgBoolean'],
        ['created_at', 'PgTimestamp'],
        ['warden_id', 'PgInteger'],
      ]);
    });

    it('reports the column type of every pitch column', () => {
      deq(columnTypesOf(parkTables.pitches), [
        ['id', 'PgSerial'],
        ['park_id', 'PgInteger'],
        ['reference', 'PgVarchar'],
        ['area_sqm', 'PgReal'],
        ['has_electricity', 'PgBoolean'],
      ]);
    });

    it('reports the column type of every owner column', () => {
      deq(columnTypesOf(parkTables.owners), [
        ['id', 'PgUUID'],
        ['full_name', 'PgVarchar'],
        ['email', 'PgVarchar'],
        ['member_since', 'PgDateString'],
        ['loyalty_points', 'PgBigInt53'],
        ['referred_by_owner_id', 'PgUUID'],
      ]);
    });

    it('reports the column type of every holiday home column', () => {
      deq(columnTypesOf(parkTables.holidayHomes), [
        ['id', 'PgBigSerial53'],
        ['pitch_id', 'PgInteger'],
        ['owner_id', 'PgUUID'],
        ['previous_owner_id', 'PgUUID'],
        ['model', 'PgText'],
        ['purchase_price', 'PgNumeric'],
        ['specification', 'PgJson'],
        ['inspected_at', 'PgTimestamp'],
      ]);
    });

    it('reports the column type of every accessory column', () => {
      deq(columnTypesOf(parkTables.accessories), [
        ['id', 'PgInteger'],
        ['holiday_home_id', 'PgBigInt53'],
        ['description', 'PgText'],
        ['quantity', 'PgSmallInt'],
      ]);
    });

    it('reports the column type of every letting column', () => {
      deq(columnTypesOf(parkTables.lettings), [
        ['id', 'PgInteger'],
        ['holiday_home_id', 'PgBigInt53'],
        ['guest_name', 'PgVarchar'],
        ['status', 'PgEnumColumn'],
        ['start_date', 'PgDateString'],
        ['end_date', 'PgDateString'],
        ['arrival_time', 'PgTime'],
        ['site_fee', 'PgNumeric'],
        ['notes', 'PgText'],
      ]);
    });

    it('reports the column type of every park owner column', () => {
      deq(columnTypesOf(parkTables.parkOwners), [
        ['park_id', 'PgInteger'],
        ['owner_id', 'PgUUID'],
      ]);
    });
  });

  describe('column detail', () => {
    it('exposes the length of a bounded text column', () => {
      eq(columnNamed(parkTables.parks, 'name').length, 120);
    });

    it('exposes no length for an unbounded text column', () => {
      eq(columnNamed(parkTables.holidayHomes, 'model').length, undefined);
    });

    it('exposes the precision and scale of a numeric column', () => {
      const column = columnNamed(parkTables.holidayHomes, 'purchasePrice');
      deq([column.precision, column.scale], [10, 2]);
    });

    it('exposes the declared values of an enum column', () => {
      deq(columnNamed(parkTables.lettings, 'status').enumValues, ['pending', 'confirmed', 'cancelled']);
    });

    it('exposes whether a timestamp column carries a timezone', () => {
      eq(columnNamed(parkTables.parks, 'createdAt').withTimezone, true);
      eq(columnNamed(parkTables.holidayHomes, 'inspectedAt').withTimezone, false);
    });

    it('exposes nullability, database defaults and primary keys', () => {
      const id = columnNamed(parkTables.parks, 'id');
      deq([id.notNull, id.hasDefault, id.primary], [true, true, true]);
      const latitude = columnNamed(parkTables.parks, 'latitude');
      deq([latitude.notNull, latitude.hasDefault, latitude.primary], [false, false, false]);
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
      const column = columnNamed(everyMode, propertyName);
      return [column.columnType, column.dataType];
    };

    it('distinguishes the two date modes, defaulting to a string', () => {
      deq(representationOf('dateAsString'), ['PgDateString', 'string']);
      deq(representationOf('dateAsDate'), ['PgDate', 'date']);
    });

    it('distinguishes the two timestamp modes, defaulting to a Date', () => {
      deq(representationOf('timestampAsDate'), ['PgTimestamp', 'date']);
      deq(representationOf('timestampAsString'), ['PgTimestampString', 'string']);
    });

    it('distinguishes the three numeric modes, defaulting to a string', () => {
      deq(representationOf('numericAsString'), ['PgNumeric', 'string']);
      deq(representationOf('numericAsNumber'), ['PgNumericNumber', 'number']);
      deq(representationOf('numericAsBigInt'), ['PgNumericBigInt', 'bigint']);
    });

    it('distinguishes the two bigint modes, which have no default', () => {
      deq(representationOf('bigIntAsNumber'), ['PgBigInt53', 'number']);
      deq(representationOf('bigIntAsBigInt'), ['PgBigInt64', 'bigint']);
      deq(representationOf('bigSerialAsBigInt'), ['PgBigSerial64', 'bigint']);
    });

    it('reports one representation for every column the park schema declares', () => {
      const representations = Object.values(parkTables).flatMap((table) =>
        Object.values(getTableColumns(table)).map((column) => column.dataType),
      );

      deq(new Set(representations), new Set(['number', 'string', 'boolean', 'date', 'json']));
    });
  });

  describe('sequence ownership', () => {
    it('reports GENERATED ALWAYS AS IDENTITY columns', () => {
      deq(columnNamed(parkTables.parks, 'id').generatedIdentity, { type: 'always' });
    });

    it('reports GENERATED BY DEFAULT AS IDENTITY columns', () => {
      deq(columnNamed(parkTables.accessories, 'id').generatedIdentity, { type: 'byDefault' });
    });

    it('reports no identity metadata for serial columns', () => {
      eq(columnNamed(parkTables.pitches, 'id').generatedIdentity, undefined);
      eq(columnNamed(parkTables.holidayHomes, 'id').generatedIdentity, undefined);
    });
  });

  describe('identifier naming', () => {
    const inline = pgTable('holidayHomes', {
      pitchId: integer(),
      ownerName: varchar({ length: 10 }),
      explicitlyNamed: integer('explicit_name'),
    });

    it('derives a name-less column name from its property key', () => {
      eq(columnNamed(inline, 'pitchId').name, 'pitchId');
      eq(columnNamed(inline, 'pitchId').keyAsName, true);
    });

    it('marks an explicitly named column so the key is not used', () => {
      eq(columnNamed(inline, 'explicitlyNamed').name, 'explicit_name');
      eq(columnNamed(inline, 'explicitlyNamed').keyAsName, false);
    });

    it('keeps the declared table name verbatim, there being no name-less table', () => {
      eq(getTableConfig(inline).name, 'holidayHomes');
    });

    it('exposes the casing conversions drizzle applies to name-less columns', () => {
      eq(toSnakeCase('pitchId'), 'pitch_id');
      eq(toSnakeCase('holidayHomes'), 'holiday_homes');
      eq(toCamelCase('holiday_homes'), 'holidayHomes');
    });
  });

  describe('schema module exports', () => {
    it('exposes an enum export as a function rather than a table', () => {
      eq(typeof lettingStatus, 'function');
      eq(lettingStatus.enumName, 'letting_status');
    });
  });
});
