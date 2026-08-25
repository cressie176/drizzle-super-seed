const { describe, it } = require('node:test');
const { deepEqual: deq, equal: eq, ok, throws } = require('node:assert');
const { integer, pgTable } = require('drizzle-orm/pg-core');
const { extractCanonicalSchema } = require('../lib');
const { orderTablesByDependency } = require('../lib/table-dependency-order');
const parkSchema = require('./lib/park-schema');

const orderOf = (schema) => orderTablesByDependency(extractCanonicalSchema(schema));

const orderedKeys = (schema) => orderOf(schema).tables.map((table) => table.key);

const positionsIn = (order) => new Map(order.tables.map((table, position) => [table.key, position]));

const foreignKeyEdges = (order) =>
  order.tables.flatMap((table) =>
    table.foreignKeys.map((foreignKey) => ({
      child: table.key,
      columnName: foreignKey.columnName,
      parent: foreignKey.referencedTableKey,
    })),
  );

const isDeferred = (order, edge) =>
  order.deferredForeignKeys.some(
    (deferred) => deferred.tableKey === edge.child && deferred.columnName === edge.columnName,
  );

// A deferred edge is the one the ordering deliberately breaks, so it is the one edge whose parent
// may follow its child.
const immediateEdges = (order) =>
  foreignKeyEdges(order).filter((edge) => edge.child !== edge.parent && !isDeferred(order, edge));

describe('table dependency order', () => {
  describe('acyclic schemas', () => {
    it('orders every parent before its children', () => {
      const order = orderOf(parkSchema);
      const positions = positionsIn(order);
      const edges = immediateEdges(order);

      eq(edges.length, 9);
      for (const edge of edges) {
        ok(
          positions.get(edge.parent) < positions.get(edge.child),
          `${edge.parent} should precede ${edge.child}, but positions were ${positions.get(edge.parent)} and ${positions.get(edge.child)}`,
        );
      }
    });

    it('preserves input order among tables it is free to', () => {
      deq(orderedKeys(parkSchema), [
        'owners',
        'parks',
        'pitches',
        'holidayHomes',
        'accessories',
        'lettings',
        'parkOwners',
        'staff',
      ]);
    });

    it('sorts tables declared child first', () => {
      const { accessories, holidayHomes, lettings, owners, parkOwners, parks, pitches, staff } = parkSchema;
      const reversed = { staff, parkOwners, lettings, accessories, holidayHomes, owners, pitches, parks };

      deq(orderedKeys(reversed), [
        'owners',
        'parks',
        'staff',
        'parkOwners',
        'pitches',
        'holidayHomes',
        'lettings',
        'accessories',
      ]);
    });

    it('defers nothing for a nullable foreign key outside a cycle', () => {
      const rangers = pgTable('rangers', {
        id: integer('id').primaryKey(),
        mentorId: integer('mentor_id').references(() => rangers.id),
        stationId: integer('station_id').references(() => stations.id),
      });
      const stations = pgTable('stations', { id: integer('id').primaryKey() });

      deq(orderOf({ rangers, stations }).deferredForeignKeys, []);
    });

    it('defers only the nullable edge which closes a cycle', () => {
      deq(orderOf(parkSchema).deferredForeignKeys, [{ tableKey: 'parks', columnName: 'warden_id' }]);
    });

    it('orders a self referencing table without deferring or throwing', () => {
      const { owners } = parkSchema;
      const order = orderOf({ owners });

      deq(
        order.tables.map((table) => table.key),
        ['owners'],
      );
      deq(order.deferredForeignKeys, []);
    });

    it('produces the same order on every run', () => {
      deq(orderedKeys(parkSchema), orderedKeys(parkSchema));
      deq(orderOf(parkSchema), orderOf(parkSchema));
    });
  });

  describe('cycles broken at a nullable foreign key', () => {
    const departments = pgTable('departments', {
      id: integer('id').primaryKey(),
      leadEmployeeId: integer('lead_employee_id').references(() => employees.id),
    });

    const employees = pgTable('employees', {
      id: integer('id').primaryKey(),
      departmentId: integer('department_id')
        .notNull()
        .references(() => departments.id),
    });

    it('defers the only nullable edge of the cycle', () => {
      const order = orderOf({ departments, employees });

      deq(
        order.tables.map((table) => table.key),
        ['departments', 'employees'],
      );
      deq(order.deferredForeignKeys, [{ tableKey: 'departments', columnName: 'lead_employee_id' }]);
    });

    it('defers the only nullable edge whichever way round the tables are declared', () => {
      const order = orderOf({ employees, departments });

      deq(
        order.tables.map((table) => table.key),
        ['departments', 'employees'],
      );
      deq(order.deferredForeignKeys, [{ tableKey: 'departments', columnName: 'lead_employee_id' }]);
    });

    const authors = pgTable('authors', {
      id: integer('id').primaryKey(),
      favouriteBookId: integer('favourite_book_id').references(() => books.id),
    });

    const books = pgTable('books', {
      id: integer('id').primaryKey(),
      authorId: integer('author_id').references(() => authors.id),
    });

    it('chooses the first nullable edge by input order when the cycle offers two', () => {
      const order = orderOf({ authors, books });

      deq(
        order.tables.map((table) => table.key),
        ['authors', 'books'],
      );
      deq(order.deferredForeignKeys, [{ tableKey: 'authors', columnName: 'favourite_book_id' }]);
    });

    it('chooses the other edge when the tables are declared the other way round', () => {
      const order = orderOf({ books, authors });

      deq(
        order.tables.map((table) => table.key),
        ['books', 'authors'],
      );
      deq(order.deferredForeignKeys, [{ tableKey: 'books', columnName: 'author_id' }]);
    });

    const teams = pgTable('teams', {
      id: integer('id').primaryKey(),
      sponsorId: integer('sponsor_id').references(() => sponsors.id),
      captainId: integer('captain_id').references(() => players.id),
    });

    const players = pgTable('players', {
      id: integer('id').primaryKey(),
      teamId: integer('team_id')
        .notNull()
        .references(() => teams.id),
    });

    const sponsors = pgTable('sponsors', {
      id: integer('id').primaryKey(),
    });

    it('skips a nullable edge that is not part of a cycle', () => {
      const order = orderOf({ teams, players, sponsors });

      deq(
        order.tables.map((table) => table.key),
        ['sponsors', 'teams', 'players'],
      );
      deq(order.deferredForeignKeys, [{ tableKey: 'teams', columnName: 'captain_id' }]);
    });

    const shifts = pgTable('shifts', {
      id: integer('id').primaryKey(),
      openingStaffId: integer('opening_staff_id').references(() => staff.id),
      closingStaffId: integer('closing_staff_id').references(() => staff.id),
    });

    const staff = pgTable('staff', {
      id: integer('id').primaryKey(),
      shiftId: integer('shift_id')
        .notNull()
        .references(() => shifts.id),
    });

    it('defers nullable edges in foreign key declaration order', () => {
      const order = orderOf({ shifts, staff });

      deq(
        order.tables.map((table) => table.key),
        ['shifts', 'staff'],
      );
      deq(order.deferredForeignKeys, [
        { tableKey: 'shifts', columnName: 'opening_staff_id' },
        { tableKey: 'shifts', columnName: 'closing_staff_id' },
      ]);
    });

    it('produces the same deferrals on every run', () => {
      deq(orderOf({ shifts, staff }), orderOf({ shifts, staff }));
    });
  });

  describe('cycles that cannot be broken', () => {
    const invoices = pgTable('invoices_table', {
      id: integer('id').primaryKey(),
      paymentId: integer('payment_id')
        .notNull()
        .references(() => payments.id),
    });

    const payments = pgTable('payments_table', {
      id: integer('id').primaryKey(),
      invoiceId: integer('invoice_id')
        .notNull()
        .references(() => invoices.id),
    });

    it('throws naming the cycle and the nullable foreign key remedy', () => {
      throws(() => orderOf({ invoices, payments }), {
        name: 'CircularDependencyError',
        message:
          'Tables invoices -> payments -> invoices form a circular dependency in which every foreign key is not null. ' +
          'No row of the cycle can be inserted first, so make one of its foreign keys nullable ' +
          'and drizzle-super-seed will break the cycle there automatically.',
        tables: ['invoices', 'payments'],
      });
    });
  });
});
