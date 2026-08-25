const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, ok, rejects, throws } = require('node:assert');
const { getTableColumns } = require('drizzle-orm');
const mysql = require('drizzle-orm/mysql-core');
const {
  ColumnKind,
  Dialect,
  createInMemoryGraphSink,
  createPostgresSqlFileSink,
  createPostgresSqlStreamSink,
  extractCanonicalSchema,
  generate,
  structuralDefault,
} = require('../lib');
const mariaDbSchema = require('./lib/park-schema-mariadb');
const parkSchema = require('./lib/park-schema');

const canonical = () => extractCanonicalSchema(mariaDbSchema);

const columnNamed = (tableKey, propertyName) =>
  canonical()
    .tables.get(tableKey)
    .columns.find((column) => column.propertyName === propertyName);

const structuralRules = Object.fromEntries(
  Object.entries(mariaDbSchema).map(([tableKey, table]) => [
    tableKey,
    Object.fromEntries(Object.keys(getTableColumns(table)).map((propertyName) => [propertyName, structuralDefault])),
  ]),
);

const COUNTS = { parks: 2, owners: 4, pitches: 3, holidayHomes: 3, accessories: 2, lettings: 3, parkOwners: 2 };

describe('mariadb schema adapter', () => {
  describe('the installed drizzle-orm', () => {
    const probe = mysql.mysqlTable('probe', {
      id: mysql.int('id').primaryKey().autoincrement(),
      tiny: mysql.tinyint('tiny'),
      medium: mysql.mediumint('medium'),
      big: mysql.bigint('big', { mode: 'number' }),
      bigger: mysql.bigint('bigger', { mode: 'bigint' }),
      counter: mysql.serial('counter'),
      money: mysql.decimal('money', { precision: 10, scale: 2 }),
      ratio: mysql.double('ratio'),
      label: mysql.varchar('label', { length: 40 }),
      note: mysql.text('note'),
      flag: mysql.boolean('flag'),
      when: mysql.datetime('when'),
      stamped: mysql.timestamp('stamped'),
      clock: mysql.time('clock'),
      payload: mysql.json('payload'),
      choice: mysql.mysqlEnum('choice', ['a', 'b']),
    });

    const typeOf = (propertyName) => getTableColumns(probe)[propertyName].columnType;

    it('reports the column type strings the mapping is written against', () => {
      deq(
        [
          typeOf('id'),
          typeOf('tiny'),
          typeOf('medium'),
          typeOf('big'),
          typeOf('bigger'),
          typeOf('counter'),
          typeOf('money'),
          typeOf('ratio'),
        ],
        [
          'MySqlInt',
          'MySqlTinyInt',
          'MySqlMediumInt',
          'MySqlBigInt53',
          'MySqlBigInt64',
          'MySqlSerial',
          'MySqlDecimal',
          'MySqlDouble',
        ],
      );
      deq(
        [
          typeOf('label'),
          typeOf('note'),
          typeOf('flag'),
          typeOf('when'),
          typeOf('stamped'),
          typeOf('clock'),
          typeOf('payload'),
          typeOf('choice'),
        ],
        [
          'MySqlVarChar',
          'MySqlText',
          'MySqlBoolean',
          'MySqlDateTime',
          'MySqlTimestamp',
          'MySqlTime',
          'MySqlJson',
          'MySqlEnumColumn',
        ],
      );
    });

    it('marks autoincrement and serial columns, and has no identity always equivalent', () => {
      eq(getTableColumns(probe).id.autoIncrement, true);
      eq(getTableColumns(probe).counter.autoIncrement, true);
      eq(getTableColumns(probe).tiny.autoIncrement, false);
      eq(getTableColumns(probe).id.generatedIdentity, undefined);
    });
  });

  describe('dialect detection', () => {
    it('reports MariaDb for a mysql-core schema', () => {
      eq(canonical().dialect, Dialect.MariaDb);
    });

    it('reports Postgres for a pg-core schema', () => {
      eq(extractCanonicalSchema(parkSchema).dialect, Dialect.Postgres);
    });

    it('rejects a schema module which mixes dialects, naming the tables', () => {
      throws(
        () => extractCanonicalSchema({ parks: parkSchema.parks, staff: parkSchema.staff, lodges: mariaDbSchema.parks }),
        {
          name: 'MixedDialectError',
          message:
            'The schema mixes Postgres and MariaDb tables, and drizzle-super-seed generates one dialect at a time: ' +
            'Postgres (parks, staff), MariaDb (lodges). ' +
            'Split them into a schema module per dialect, and generate each separately.',
          dialects: ['Postgres', 'MariaDb'],
          tables: { Postgres: ['parks', 'staff'], MariaDb: ['lodges'] },
        },
      );
    });
  });

  describe('the mariadb park fixture', () => {
    it('extracts every table', () => {
      deq(
        [...canonical().tables.keys()],
        ['parks', 'pitches', 'owners', 'holidayHomes', 'accessories', 'lettings', 'parkOwners'],
      );
    });

    it('maps every column kind the fixture uses', () => {
      eq(columnNamed('parks', 'id').kind, ColumnKind.Integer);
      eq(columnNamed('parks', 'openedAt').kind, ColumnKind.Timestamp);
      eq(columnNamed('parks', 'latitude').kind, ColumnKind.Real);
      eq(columnNamed('parks', 'amenities').kind, ColumnKind.Json);
      eq(columnNamed('parks', 'active').kind, ColumnKind.Boolean);
      eq(columnNamed('holidayHomes', 'purchasePrice').kind, ColumnKind.Decimal);
      eq(columnNamed('lettings', 'status').kind, ColumnKind.Enum);
      eq(columnNamed('lettings', 'arrivalTime').kind, ColumnKind.Time);
      eq(columnNamed('accessories', 'quantity').kind, ColumnKind.Integer);
    });

    it('records the range of each integer width', () => {
      eq(columnNamed('parks', 'id').maxValue, 2_147_483_647);
      eq(columnNamed('accessories', 'quantity').maxValue, 32_767);
      eq(columnNamed('owners', 'loyaltyPoints').maxValue, Number.MAX_SAFE_INTEGER);
    });

    it('marks autoincrement and serial columns as sequence owned', () => {
      eq(columnNamed('parks', 'id').sequenceOwned, true);
      eq(columnNamed('pitches', 'id').sequenceOwned, true);
      eq(columnNamed('parks', 'name').sequenceOwned, false);
    });

    it('never marks a column identity always, because mysql has no equivalent', () => {
      const everyColumn = [...canonical().tables.values()].flatMap((table) => table.columns);

      ok(everyColumn.every((column) => column.identityAlways === false));
    });

    it('reads the keys, constraints and relationships', () => {
      const canonicalSchema = canonical();

      deq(canonicalSchema.tables.get('parkOwners').primaryKey, ['park_id', 'owner_id']);
      deq(canonicalSchema.tables.get('owners').uniqueConstraints, [{ columns: ['email'], nullsNotDistinct: false }]);
      deq(canonicalSchema.tables.get('lettings').uniqueConstraints, [
        { columns: ['holiday_home_id', 'start_date'], nullsNotDistinct: false },
      ]);
      deq(canonicalSchema.tables.get('owners').foreignKeys, [
        { columnName: 'referred_by_owner_id', referencedTableKey: 'owners', referencedColumnName: 'id' },
      ]);
    });

    it('rejects a column type it has no mapping for', () => {
      const probe = mysql.mysqlTable('probe', {
        id: mysql.int('id').primaryKey(),
        blob: mysql.binary('blob', { length: 4 }),
      });

      eq(extractCanonicalSchema({ probe }).tables.get('probe').columns[1].kind, ColumnKind.Text);
    });
  });

  describe('the sinks which serve one dialect', () => {
    it('refuse a schema of another dialect, naming both', async () => {
      await rejects(
        generate(
          { schema: mariaDbSchema, rules: structuralRules, counts: { parks: 1 }, seed: 42 },
          createPostgresSqlFileSink({ directory: '/tmp/never-written' }),
        ),
        {
          name: 'WrongDialectError',
          message:
            'This sink writes Postgres, but the schema is MariaDb. Use the MariaDb sink, or one of the ' +
            'sinks which serve every dialect: createInMemoryGraphSink and createRowBatchSink.',
          sinkDialect: 'Postgres',
          schemaDialect: 'MariaDb',
        },
      );
    });

    it('refuse it from the stream sink too', async () => {
      await rejects(
        generate(
          { schema: mariaDbSchema, rules: structuralRules, counts: { parks: 1 }, seed: 42 },
          createPostgresSqlStreamSink({ writable: process.stdout }),
        ),
        { name: 'WrongDialectError' },
      );
    });
  });

  describe('the sinks which serve every dialect', () => {
    it('generate a whole mariadb dataset into a graph', async () => {
      const graph = await generate(
        { schema: mariaDbSchema, rules: structuralRules, counts: COUNTS, seed: 42 },
        createInMemoryGraphSink(),
      );

      deq(graph.report.rowCounts, COUNTS);
      for (const pitch of graph.rows.pitches) eq(graph.parentOf('pitches', pitch, 'parkId').id, pitch.parkId);
    });

    it('number the sequence owned keys from one', async () => {
      const graph = await generate(
        { schema: mariaDbSchema, rules: structuralRules, counts: { parks: 3 }, seed: 42 },
        createInMemoryGraphSink(),
      );

      deq(
        graph.rows.parks.map((park) => park.id),
        [1, 2, 3],
      );
    });
  });
});
