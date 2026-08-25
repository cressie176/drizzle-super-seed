const { describe, it, before, after } = require('node:test');
const { deepEqual: deq, equal: eq, ok, rejects } = require('node:assert');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const Database = require('better-sqlite3');
const { getTableColumns } = require('drizzle-orm');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const sqlite = require('drizzle-orm/sqlite-core');
const {
  ColumnKind,
  Dialect,
  createInMemoryGraphSink,
  createMariaDbSqlFileSink,
  createPostgresSqlFileSink,
  createRowBatchSink,
  extractCanonicalSchema,
  generate,
  structuralDefault,
} = require('../lib');
const sqliteSchema = require('./lib/park-schema-sqlite');

const SEED = 42;
const REFERENCE_DATE = new Date('2024-06-01T00:00:00.000Z');

const COUNTS = { parks: 3, pitches: 6, owners: 8, holidayHomes: 5, lettings: 7, parkOwners: 4 };

const structuralRules = Object.fromEntries(
  Object.entries(sqliteSchema).map(([tableKey, table]) => [
    tableKey,
    Object.fromEntries(Object.keys(getTableColumns(table)).map((propertyName) => [propertyName, structuralDefault])),
  ]),
);

const canonical = () => extractCanonicalSchema(sqliteSchema);

const columnNamed = (tableKey, propertyName) =>
  canonical()
    .tables.get(tableKey)
    .columns.find((column) => column.propertyName === propertyName);

describe('sqlite schema adapter', () => {
  describe('the installed drizzle-orm', () => {
    const probe = sqlite.sqliteTable('probe', {
      id: sqlite.integer('id').primaryKey({ autoIncrement: true }),
      plain: sqlite.integer('plain'),
      flag: sqlite.integer('flag', { mode: 'boolean' }),
      when: sqlite.integer('when', { mode: 'timestamp' }),
      label: sqlite.text('label'),
      payload: sqlite.text('payload', { mode: 'json' }),
      amount: sqlite.real('amount'),
      money: sqlite.numeric('money'),
      huge: sqlite.blob('huge', { mode: 'bigint' }),
      bytes: sqlite.blob('bytes'),
    });

    const typeOf = (propertyName) => getTableColumns(probe)[propertyName].columnType;

    it('reports the column type strings the mapping is written against', () => {
      deq(
        [typeOf('id'), typeOf('flag'), typeOf('when'), typeOf('label'), typeOf('payload')],
        ['SQLiteInteger', 'SQLiteBoolean', 'SQLiteTimestamp', 'SQLiteText', 'SQLiteTextJson'],
      );
      deq(
        [typeOf('amount'), typeOf('money'), typeOf('huge'), typeOf('bytes')],
        ['SQLiteReal', 'SQLiteNumeric', 'SQLiteBigInt', 'SQLiteBlobBuffer'],
      );
    });

    it('carries a bigint through blob rather than integer, whatever §3.16 expected', () => {
      eq(getTableColumns(probe).plain.dataType, 'number');
      eq(getTableColumns(probe).huge.dataType, 'bigint');
    });
  });

  describe('dialect detection', () => {
    it('reports Sqlite for a sqlite-core schema', () => {
      eq(canonical().dialect, Dialect.Sqlite);
    });
  });

  describe('the sqlite park fixture', () => {
    it('extracts every table', () => {
      deq([...canonical().tables.keys()], ['parks', 'pitches', 'owners', 'holidayHomes', 'lettings', 'parkOwners']);
    });

    it('maps every column kind the fixture uses', () => {
      eq(columnNamed('parks', 'id').kind, ColumnKind.Integer);
      eq(columnNamed('parks', 'openedAt').kind, ColumnKind.Timestamp);
      eq(columnNamed('parks', 'latitude').kind, ColumnKind.Real);
      eq(columnNamed('parks', 'amenities').kind, ColumnKind.Json);
      eq(columnNamed('parks', 'active').kind, ColumnKind.Boolean);
      eq(columnNamed('owners', 'loyaltyPoints').kind, ColumnKind.BigInt);
      eq(columnNamed('lettings', 'siteFee').kind, ColumnKind.Real);
    });

    it('has no enum kind, because sqlite has no enums', () => {
      const kinds = new Set(
        [...canonical().tables.values()].flatMap((table) => table.columns.map((each) => each.kind)),
      );

      ok(!kinds.has(ColumnKind.Enum));
    });

    it('marks the rowid alias as sequence owned, and never identity always', () => {
      eq(columnNamed('parks', 'id').sequenceOwned, true);
      eq(columnNamed('parks', 'name').sequenceOwned, false);
      eq(columnNamed('parks', 'id').identityAlways, false);
    });

    it('reads the keys, constraints and relationships', () => {
      const schema = canonical();

      deq(schema.tables.get('parkOwners').primaryKey, ['park_id', 'owner_id']);
      deq(schema.tables.get('owners').uniqueConstraints, [{ columns: ['email'], nullsNotDistinct: false }]);
      deq(schema.tables.get('owners').foreignKeys, [
        { columnName: 'referred_by_owner_id', referencedTableKey: 'owners', referencedColumnName: 'id' },
      ]);
    });

    it('rejects a column type it has no mapping for', () => {
      const probe = sqlite.sqliteTable('probe', {
        id: sqlite.integer('id').primaryKey(),
        bytes: sqlite.blob('bytes'),
      });

      try {
        extractCanonicalSchema({ probe });
        ok(false, 'expected an UnsupportedColumnTypeError');
      } catch (error) {
        eq(error.name, 'UnsupportedColumnTypeError');
        eq(error.columnType, 'SQLiteBlobBuffer');
      }
    });
  });

  describe('the sinks which serve one dialect', () => {
    const generateWith = (sink) =>
      generate({ schema: sqliteSchema, rules: structuralRules, counts: { parks: 1 }, seed: SEED }, sink);

    it('is refused by the postgres file sink', async () => {
      await rejects(generateWith(createPostgresSqlFileSink({ directory: '/tmp/never-written' })), {
        name: 'WrongDialectError',
        sinkDialect: 'Postgres',
        schemaDialect: 'Sqlite',
      });
    });

    it('is refused by the mariadb file sink', async () => {
      await rejects(generateWith(createMariaDbSqlFileSink({ directory: '/tmp/never-written' })), {
        name: 'WrongDialectError',
        sinkDialect: 'MariaDb',
        schemaDialect: 'Sqlite',
      });
    });
  });

  describe('the sinks which serve every dialect', () => {
    it('generate a whole sqlite dataset into a graph', async () => {
      const graph = await generate(
        { schema: sqliteSchema, rules: structuralRules, counts: COUNTS, seed: SEED, referenceDate: REFERENCE_DATE },
        createInMemoryGraphSink(),
      );

      deq(graph.report.rowCounts, COUNTS);
      for (const pitch of graph.rows.pitches) eq(graph.parentOf('pitches', pitch, 'parkId').id, pitch.parkId);
    });

    describe('into a file backed database', () => {
      let directory;
      let database;
      let db;

      before(async () => {
        directory = await mkdtemp(join(tmpdir(), 'drizzle-super-seed-'));
        database = new Database(join(directory, 'park.db'));
        database.pragma('foreign_keys = ON');
        db = drizzle({ client: database });
        database.exec(await readFile(join(__dirname, 'lib', 'park-schema-sqlite.sql'), 'utf8'));
        await generate(
          {
            schema: sqliteSchema,
            rules: structuralRules,
            counts: COUNTS,
            seed: SEED,
            referenceDate: REFERENCE_DATE,
            batchSize: 3,
          },
          createRowBatchSink((batch) => db.insert(batch.table).values(batch.rows)),
        );
      });

      after(async () => {
        database.close();
        await rm(directory, { recursive: true, force: true });
      });

      it('inserts every row with foreign keys enforced', () => {
        eq(database.pragma('foreign_keys', { simple: true }), 1);
        for (const [tableKey, count] of Object.entries(COUNTS)) {
          const table = {
            parks: 'parks',
            pitches: 'pitches',
            owners: 'owners',
            holidayHomes: 'holiday_homes',
            lettings: 'lettings',
            parkOwners: 'park_owners',
          }[tableKey];
          eq(database.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total, count);
        }
      });

      it('leaves no foreign key violation', () => {
        deq(database.pragma('foreign_key_check'), []);
      });

      it('numbers the rowid keys from one', () => {
        deq(
          database
            .prepare('SELECT id FROM parks ORDER BY id')
            .all()
            .map((row) => row.id),
          [1, 2, 3],
        );
      });

      it('advances the rowid past the ids it inserted', () => {
        const { lastInsertRowid } = database
          .prepare("INSERT INTO parks (name, region, opened_at, active) VALUES ('New Park', 'wales', 0, 1)")
          .run();

        eq(Number(lastInsertRowid), COUNTS.parks + 1);
      });
    });
  });
});
