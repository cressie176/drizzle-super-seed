const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, ok, rejects } = require('node:assert');
const { Writable } = require('node:stream');
const { foreignKey, integer, pgTable, primaryKey } = require('drizzle-orm/pg-core');
const { createRecordingSink, rowsOf } = require('./lib/recording-sink');
const {
  createPostgresSqlStreamSink,
  derive,
  extractCanonicalSchema,
  generate,
  randomInteger,
  structuralDefault,
} = require('../lib');

const SEED = 18;

// The AdventureWorks shape: a pair table, and a child whose two columns must match one of its
// rows together.
const offerProducts = pgTable(
  'offer_products',
  {
    offerId: integer('offer_id').notNull(),
    productId: integer('product_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.offerId, table.productId] })],
);

const orderLines = pgTable(
  'order_lines',
  {
    id: integer('id').primaryKey(),
    offerId: integer('offer_id').notNull(),
    productId: integer('product_id').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.offerId, table.productId],
      foreignColumns: [offerProducts.offerId, offerProducts.productId],
      name: 'order_lines_offer_product_fkey',
    }),
  ],
);

const rowNumber = derive((_row, context) => context.rowIndex + 1);

describe('composite foreign keys in the adapter', () => {
  it('records the relationship instead of refusing the schema', () => {
    const canonical = extractCanonicalSchema({ offerProducts, orderLines });
    const lines = canonical.tables.get('orderLines');

    deq(lines.compositeForeignKeys, [
      {
        columns: ['offer_id', 'product_id'],
        referencedTableKey: 'offerProducts',
        referencedColumns: ['offer_id', 'product_id'],
      },
    ]);
    deq(lines.foreignKeys, []);
  });

  it('orders the referenced table first, with only the composite edge linking them', async () => {
    const result = await generate(
      {
        schema: { orderLines, offerProducts },
        rules: {
          offerProducts: { offerId: rowNumber, productId: rowNumber },
          orderLines: { id: rowNumber, offerId: randomInteger(1, 5), productId: derive((row) => row.offerId) },
        },
        counts: { orderLines: 5, offerProducts: 5 },
        seed: SEED,
      },
      createRecordingSink(),
    );

    const order = result.calls.filter((call) => call.startsWith('beginTable'));
    deq(order, ['beginTable offerProducts', 'beginTable orderLines']);
    eq(rowsOf(result, 'orderLines').length, 5);
  });
});

describe('composite foreign keys in the rules', () => {
  it('refuses structuralDefault on a member column, naming the whole tuple and the remedy', async () => {
    const sink = createRecordingSink();

    await rejects(
      generate(
        {
          schema: { offerProducts, orderLines },
          rules: {
            offerProducts: { offerId: rowNumber, productId: rowNumber },
            orderLines: { id: rowNumber, offerId: structuralDefault, productId: structuralDefault },
          },
          counts: { offerProducts: 5, orderLines: 5 },
          seed: SEED,
        },
        sink,
      ),
      {
        name: 'CompositeForeignKeyRuleRequiredError',
        table: 'orderLines',
        column: 'offerId',
        columns: ['offerId', 'productId'],
        referencedTable: 'offerProducts',
        message:
          'Column orderLines.offerId belongs to the composite foreign key (offerId, productId) ' +
          'referencing offerProducts, and tuple members cannot be picked independently. ' +
          'Write rules for these columns that keep the tuple valid together.',
      },
    );

    deq(sink.end({}).calls, ['end']);
  });
});

describe('composite foreign keys and the unlogged ordering', () => {
  const streamed = async (schema, rules, counts) => {
    const chunks = [];
    const writable = new Writable({
      write(chunk, _encoding, done) {
        chunks.push(String(chunk));
        done();
      },
    });
    await generate({ schema, rules, counts, seed: SEED }, createPostgresSqlStreamSink({ writable }));
    return chunks.join('');
  };

  it('alters the referencing table before the pair table it points at', async () => {
    const script = await streamed(
      { offerProducts, orderLines },
      {
        offerProducts: { offerId: rowNumber, productId: rowNumber },
        orderLines: { id: rowNumber, offerId: randomInteger(1, 5), productId: derive((row) => row.offerId) },
      },
      { offerProducts: 5, orderLines: 5 },
    );

    const altered = [...script.matchAll(/ALTER TABLE "public"\."(\w+)" SET UNLOGGED;/g)].map(([, name]) => name);
    deq(altered, ['order_lines', 'offer_products']);
  });
});

describe('composite foreign keys in cycles', () => {
  it('cannot be broken, so a cycle with no nullable single edge is refused', async () => {
    const rosters = pgTable(
      'rosters',
      {
        teamId: integer('team_id').notNull(),
        season: integer('season').notNull(),
        captainId: integer('captain_id')
          .notNull()
          .references(() => players.id),
      },
      (table) => [primaryKey({ columns: [table.teamId, table.season] })],
    );

    const players = pgTable(
      'players',
      {
        id: integer('id').primaryKey(),
        teamId: integer('team_id').notNull(),
        season: integer('season').notNull(),
      },
      (table) => [
        foreignKey({
          columns: [table.teamId, table.season],
          foreignColumns: [rosters.teamId, rosters.season],
          name: 'players_roster_fkey',
        }),
      ],
    );

    await rejects(
      generate(
        {
          schema: { rosters, players },
          rules: {
            rosters: { teamId: rowNumber, season: rowNumber, captainId: rowNumber },
            players: { id: rowNumber, teamId: rowNumber, season: rowNumber },
          },
          counts: { rosters: 2, players: 2 },
          seed: SEED,
        },
        createRecordingSink(),
      ),
      { name: 'CircularDependencyError' },
    );
  });
});
