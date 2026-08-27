const { describe, it, before, after } = require('node:test');
const { deepEqual: deq, ok } = require('node:assert');
const { getTableColumns } = require('drizzle-orm');
const { drizzle } = require('drizzle-orm/node-postgres');
const { ColumnKind, extractCanonicalSchema, generate } = require('../lib');
const { serialiseCopyRow } = require('../lib/postgres/copy-text-serialisation');
const { executeScript } = require('./lib/psql');
const { connect, createParkSchema, dropParkSchema } = require('./lib/park-database');
const { structuralParkRules } = require('./lib/park-rules');
const parkSchema = require('./lib/park-schema');
const { createRecordingSink, rowsOf } = require('./lib/recording-sink');

const SEED = 42;
const REFERENCE_DATE = new Date('2024-06-01T00:00:00.000Z');

const COUNTS = {
  parks: 4,
  pitches: 6,
  owners: 10,
  holidayHomes: 8,
  accessories: 6,
  lettings: 8,
  parkOwners: 5,
};

const quoted = (name) => `"${name}"`;

const columnList = (table) => table.columns.map((column) => quoted(column.name)).join(', ');

const copyHeader = (name, columns) => `COPY "public".${quoted(name)} (${columns}) FROM stdin;\n`;

const copyBlock = (table, rows) => {
  const body = rows.map((row) => serialiseCopyRow(table.columns, row, table.key)).join('');
  return `${copyHeader(table.name, columnList(table))}${body}\\.\n`;
};

const copyScript = (schema, result) =>
  [...schema.tables.values()].map((table) => copyBlock(table, rowsOf(result, table.key))).join('');

const isSinglePrecision = (tableKey, propertyName) =>
  getTableColumns(parkSchema[tableKey])[propertyName].columnType === 'PgReal';

const asStored = (tableKey, row) =>
  Object.fromEntries(
    Object.entries(row).map(([propertyName, value]) => [
      propertyName,
      value !== null && isSinglePrecision(tableKey, propertyName) ? Math.fround(value) : value,
    ]),
  );

describe('copy text serialisation', () => {
  let client;
  let db;
  let schema;
  let generated;

  before(async () => {
    client = await connect();
    db = drizzle({ client });
    schema = extractCanonicalSchema(parkSchema);
    await dropParkSchema(client);
    await createParkSchema(client);
    generated = await generate(
      {
        schema: parkSchema,
        rules: structuralParkRules,
        counts: COUNTS,
        seed: SEED,
        referenceDate: REFERENCE_DATE,
      },
      createRecordingSink(),
    );
    await executeScript(copyScript(schema, generated));
  });

  after(async () => {
    await dropParkSchema(client);
    await client.end();
  });

  describe('loaded through psql', () => {
    const readBack = (tableKey) => db.select().from(parkSchema[tableKey]);

    it('loads every generated row', async () => {
      for (const tableKey of Object.keys(COUNTS)) {
        deq((await readBack(tableKey)).length, COUNTS[tableKey]);
      }
    });

    it('reads back every value it wrote, for every column kind in the fixture', async () => {
      for (const table of schema.tables.values()) {
        const expected = rowsOf(generated, table.key).map((row) => asStored(table.key, row));
        const stored = (await readBack(table.key)).map((row) => asStored(table.key, row));

        deq(stored, expected, `${table.key} did not round trip`);
      }
    });

    it('covers every column kind the canonical model has', () => {
      const kinds = new Set([...schema.tables.values()].flatMap((table) => table.columns.map((each) => each.kind)));

      // Custom has no derivable default and Vector needs the pgvector extension, which the
      // compose image does not carry, so neither can join a structural-rules fixture. Their own
      // round trips live in custom-columns.integration.test.js and vector-columns.test.js.
      const separatelyProved = new Set([ColumnKind.Custom, ColumnKind.Vector]);
      deq(kinds, new Set(Object.values(ColumnKind).filter((kind) => !separatelyProved.has(kind))));
    });

    it('accepts explicit values for a generated always identity column', async () => {
      const parks = await readBack('parks');

      deq(
        parks.map((park) => park.id),
        [1, 2, 3, 4],
      );
    });
  });

  describe('escaping through psql', () => {
    const AWKWARD = [
      'a\tb',
      'a\nb',
      'a\r\nb',
      'a\\b',
      '\\N',
      '\\t',
      '\\\\',
      '',
      'trailing space ',
      ' leading space',
      '\\.',
      'quote " and apostrophe \'',
    ];

    before(async () => {
      await executeScript('DROP TABLE IF EXISTS escape_probe; CREATE TABLE escape_probe (id integer, value text)');
      const columns = [
        { name: 'id', propertyName: 'id', kind: ColumnKind.Integer },
        { name: 'value', propertyName: 'value', kind: ColumnKind.Text },
      ];
      const rows = AWKWARD.map((value, id) => serialiseCopyRow(columns, { id, value }, 'escapeProbe')).join('');

      await executeScript(`COPY escape_probe ("id", "value") FROM stdin;\n${rows}\\.\n`);
    });

    after(async () => {
      await executeScript('DROP TABLE IF EXISTS escape_probe');
    });

    it('reads back every awkward string exactly as it was written', async () => {
      const { rows } = await client.query('SELECT id, value FROM escape_probe ORDER BY id');

      deq(
        rows.map((row) => row.value),
        AWKWARD,
      );
    });

    it('tells an empty string apart from null after a round trip', async () => {
      const { rows } = await client.query('SELECT value FROM escape_probe WHERE value = $1', ['']);

      ok(rows.length === 1);
    });
  });
});
