export enum ColumnKind {
  Integer = 'Integer',
  BigInt = 'BigInt',
  Decimal = 'Decimal',
  Real = 'Real',
  Text = 'Text',
  Boolean = 'Boolean',
  Uuid = 'Uuid',
  Date = 'Date',
  Timestamp = 'Timestamp',
  Time = 'Time',
  Json = 'Json',
  Enum = 'Enum',
  Custom = 'Custom',
}

export interface CanonicalColumn {
  name: string;
  propertyName: string;
  kind: ColumnKind;
  jsType: 'number' | 'string' | 'bigint' | 'boolean' | 'date' | 'json' | 'custom';
  notNull: boolean;
  hasDatabaseDefault: boolean;
  isPrimaryKey: boolean;
  sequenceOwned: boolean;
  identityAlways: boolean;
  enumValues?: readonly string[];
  customType?: string;
  minValue?: number | bigint;
  maxValue?: number | bigint;
  maxLength?: number;
  precision?: number;
  scale?: number;
  withTimezone?: boolean;
  fractionalSecondDigits?: number;
}

export interface CanonicalUniqueConstraint {
  columns: string[];
  nullsNotDistinct: boolean;
}

export interface CanonicalForeignKey {
  columnName: string;
  referencedTableKey: string;
  referencedColumnName: string;
}

export interface CanonicalTable {
  key: string;
  name: string;
  schemaName?: string;
  columns: CanonicalColumn[];
  primaryKey: string[];
  foreignKeys: CanonicalForeignKey[];
  uniqueConstraints: CanonicalUniqueConstraint[];
  drizzleTable: unknown;
}

export enum Dialect {
  Postgres = 'Postgres',
  MariaDb = 'MariaDb',
  Sqlite = 'Sqlite',
}

export type CanonicalRelation =
  | {
      tableKey: string;
      name: string;
      kind: 'one' | 'many';
      foreignTableKey: string;
      localColumns: string[];
      foreignColumns: string[];
    }
  | {
      tableKey: string;
      name: string;
      kind: 'one' | 'many';
      foreignTableKey?: string;
      error: 'noInverse' | 'ambiguousInverse' | 'unknownTable';
    };

export interface CanonicalSchema {
  dialect: Dialect;
  tables: Map<string, CanonicalTable>;
  relations: CanonicalRelation[];
}

export enum IdentifierCasing {
  SnakeCase = 'snake_case',
  CamelCase = 'camelCase',
}

export function extractCanonicalSchema(
  schema: Record<string, unknown>,
  options?: { casing?: IdentifierCasing },
): CanonicalSchema;

export interface RandomSource {
  next(): number;
  intBetween(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  uuid(): string;
}

export interface GenerationContext {
  random: RandomSource;
  seed: number;
  row: Readonly<Record<string, unknown>>;
  parentRow?: Readonly<Record<string, unknown>>;
  rowIndex: number;
  priorSelfReferenceValues?: readonly unknown[];
  lookups: Readonly<Record<string, unknown>>;
  referenceDate: Date;
}

export type ValueGenerator<TValue> = (context: GenerationContext) => TValue;

export const structuralDefault: unique symbol;

export const unseeded: unique symbol;

export type ColumnRule<TValue> = ValueGenerator<TValue> | TValue | typeof structuralDefault;

// Constrained structurally on `$inferInsert`, not on drizzle's `Table`. drizzle ships separate
// declarations for import and require resolution, and its `Column` has a protected member, so a
// `Table` from one copy is not the `Table` of the other: an ESM consumer on NodeNext would filter
// every table out of `SchemaRules` and silently lose drift detection. `$inferInsert` is the only
// thing these types read, and it is the same type in either copy.
interface InsertableTable {
  $inferInsert: object;
}

export type TableRules<TTable extends InsertableTable> = {
  [K in keyof Required<TTable['$inferInsert']>]: ColumnRule<Required<TTable['$inferInsert']>[K]>;
};

// Every table key stays mandatory, so a new table in the schema module is a compile-time
// event; a table the run deliberately does not seed declares so with `unseeded`, one visible
// line instead of a rules object.
export type SchemaRules<TSchema> = {
  [K in keyof TSchema as TSchema[K] extends InsertableTable ? K : never]: TSchema[K] extends InsertableTable
    ? TableRules<TSchema[K]> | typeof unseeded
    : never;
};

export interface GenerationReport {
  seed: number;
  referenceDate: Date;
  rowCounts: Record<string, number>;
  durationMs: number;
}

export interface DeferredUpdate {
  primaryKey: Record<string, unknown>;
  values: Record<string, unknown>;
}

export interface GenerationSink<TResult> {
  prepare?(schema: CanonicalSchema): Promise<void> | void;
  beginTable?(table: CanonicalTable): Promise<void> | void;
  writeRows(table: CanonicalTable, rows: Record<string, unknown>[]): Promise<void> | void;
  endTable?(table: CanonicalTable): Promise<void> | void;
  writeDeferredUpdates?(table: CanonicalTable, updates: DeferredUpdate[]): Promise<void> | void;
  end(report: GenerationReport): TResult | Promise<TResult>;
}

export type CountRule = number | { per: string; count: ValueGenerator<number>; retain?: readonly string[] };

export interface GenerationConfig<TSchema = Record<string, unknown>> {
  schema: TSchema;
  casing?: IdentifierCasing;
  rules: SchemaRules<TSchema>;
  counts: Record<string, CountRule>;
  seed?: number;
  referenceDate?: Date;
  lookups?: Record<string, () => Promise<unknown>>;
  overrides?: Record<string, Array<Record<string, unknown>>>;
  batchSize?: number;
}

// Graph rows carry every column, including a GENERATED ALWAYS AS IDENTITY column the engine
// numbers itself, so `$inferSelect` is the accurate row type. `Required<$inferInsert>` would be
// missing exactly the identity column a test reaches for when linking rows by hand.
interface SelectableTable {
  $inferSelect: object;
}

type SchemaTableKey<TSchema> = {
  [K in keyof TSchema]: TSchema[K] extends SelectableTable ? K : never;
}[keyof TSchema];

// The schema type argument is optional: `createInMemoryGraphSink()` still returns the string-keyed
// graph it always did. The tuple stops `never` distributing, which would make the check vacuous.
type UntypedSchema<TSchema> = [SchemaTableKey<TSchema>] extends [never] ? true : false;

// The structural shape of a `relations()` declaration and its entries, matched without importing
// drizzle types for the reason established on SchemaRules: drizzle ships separate declarations for
// import and require resolution, and naming its types here would break one of them. `$brand` and
// `referencedTableName` are public members of drizzle's own classes; `isNullable` exists only on
// `One`, which is what separates a single row from an array.
interface DeclaredRelation {
  $brand: 'Relation';
  referencedTableName: string;
}

interface DeclaredRelations {
  $brand: 'Relations';
  table: { _: { name: string } };
  config: (helpers: never) => Record<string, DeclaredRelation>;
}

type DeclaredTableName<TTable> = TTable extends { _: { name: infer TName extends string } } ? TName : never;

type UnionToIntersection<TUnion> = (TUnion extends unknown ? (member: TUnion) => void : never) extends (
  intersected: infer TIntersection,
) => void
  ? TIntersection
  : never;

type DeclaredRelationsFor<TSchema, TName extends string> = UnionToIntersection<
  {
    [K in keyof TSchema]: TSchema[K] extends DeclaredRelations
      ? DeclaredTableName<TSchema[K]['table']> extends TName
        ? ReturnType<TSchema[K]['config']>
        : never
      : never;
  }[keyof TSchema]
>;

type TableKeyByName<TSchema, TName extends string> = {
  [K in keyof TSchema]: TSchema[K] extends SelectableTable
    ? DeclaredTableName<TSchema[K]> extends TName
      ? K
      : never
    : never;
}[keyof TSchema];

type NavigationTarget<TSchema, TRelation> = TRelation extends { referencedTableName: infer TName extends string }
  ? GraphRow<TSchema, TableKeyByName<TSchema, TName>>
  : never;

// drizzle's `One.isNullable` is inverted from its name: the helper computes it as
// Equal<notNull, true>, and drizzle's own query types add `null` when it is *false*. Followed
// here so a one() over a NOT NULL foreign key navigates without a null check, exactly as it
// does in db.query results.
type NavigationProperty<TSchema, TRelation> = TRelation extends { isNullable: boolean }
  ? TRelation extends { isNullable: true }
    ? NavigationTarget<TSchema, TRelation>
    : NavigationTarget<TSchema, TRelation> | null
  : NavigationTarget<TSchema, TRelation>[];

// A relation whose name collides with a column keeps the column, at runtime and here.
type NavigationOf<TSchema, TKey, TRow> = DeclaredRelationsFor<
  TSchema,
  DeclaredTableName<TSchema[TKey & keyof TSchema]>
> extends infer TConfig
  ? [TConfig] extends [never]
    ? unknown
    : { readonly [N in Exclude<keyof TConfig, keyof TRow>]: NavigationProperty<TSchema, TConfig[N]> }
  : never;

export type GraphRow<TSchema, TKey> = UntypedSchema<TSchema> extends true
  ? Record<string, unknown>
  : TKey extends keyof TSchema
    ? TSchema[TKey] extends SelectableTable
      ? TSchema[TKey]['$inferSelect'] & NavigationOf<TSchema, TKey, TSchema[TKey]['$inferSelect']>
      : never
    : never;

export type GraphTableName<TSchema> = UntypedSchema<TSchema> extends true ? string : SchemaTableKey<TSchema>;

export type GraphRows<TSchema> = UntypedSchema<TSchema> extends true
  ? Record<string, Record<string, unknown>[]>
  : { [K in SchemaTableKey<TSchema>]: GraphRow<TSchema, K>[] };

export interface DataGraph<TSchema = Record<string, unknown>> {
  report: GenerationReport;
  rows: GraphRows<TSchema>;
  // The parent table is not an argument — it is whichever table the foreign key points at, which
  // no drizzle type records — so it is named as an explicit type argument, or left as the union of
  // every row the schema can hold.
  parentOf<TParent extends GraphTableName<TSchema> = GraphTableName<TSchema>>(
    childTableKey: GraphTableName<TSchema>,
    childRow: Record<string, unknown>,
    foreignKeyColumn: string,
  ): GraphRow<TSchema, TParent> | null;
  childrenOf<TChild extends GraphTableName<TSchema>>(
    parentTableKey: GraphTableName<TSchema>,
    parentRow: Record<string, unknown>,
    childTableKey: TChild,
  ): GraphRow<TSchema, TChild>[];
}

export function createInMemoryGraphSink<TSchema = Record<string, unknown>>(): GenerationSink<DataGraph<TSchema>>;

export interface RowBatch {
  tableKey: string;
  table: unknown;
  rows: Record<string, unknown>[];
  overrideSystemValue: boolean;
}

export type RowBatchHandler = (batch: RowBatch) => Promise<void> | void;

export interface DeferredUpdateBatch {
  tableKey: string;
  table: unknown;
  columnNames: string[];
  updates: DeferredUpdate[];
}

export type DeferredUpdateBatchHandler = (batch: DeferredUpdateBatch) => Promise<void> | void;

export function createRowBatchSink(
  handler: RowBatchHandler,
  deferredUpdateHandler?: DeferredUpdateBatchHandler,
): GenerationSink<GenerationReport>;

export enum TriggerHandling {
  DisableDuringLoad = 'DisableDuringLoad',
  LeaveEnabled = 'LeaveEnabled',
}

export enum TableLogging {
  SetUnlogged = 'SetUnlogged',
  LeaveLogged = 'LeaveLogged',
}

export function createCsvFileSink(options: {
  directory: string;
  header?: boolean;
  nullToken?: string;
}): GenerationSink<GenerationReport>;

export function createMariaDbSqlFileSink(options: {
  directory: string;
  rowsPerStatement?: number;
}): GenerationSink<GenerationReport>;

export function createPostgresSqlFileSink(options: {
  directory: string;
  triggerHandling?: TriggerHandling;
  tableLogging?: TableLogging;
}): GenerationSink<GenerationReport>;

export function createPostgresSqlStreamSink(options: {
  writable: NodeJS.WritableStream;
  triggerHandling?: TriggerHandling;
  tableLogging?: TableLogging;
}): GenerationSink<GenerationReport>;

export function generate<TSchema, TResult>(
  config: GenerationConfig<TSchema>,
  sink: GenerationSink<TResult>,
): Promise<TResult>;

export function constant<TValue>(value: TValue): ValueGenerator<TValue>;

export function randomInteger(min: number, max: number): ValueGenerator<number>;

export function randomDecimalString(min: number, max: number, scale: number): ValueGenerator<string>;

export function randomBoolean(probabilityTrue?: number): ValueGenerator<boolean>;

export function randomWords(options?: { minLength?: number; maxLength?: number }): ValueGenerator<string>;

export function randomUuid(): ValueGenerator<string>;

export function randomDateBetween(from: Date, to: Date): ValueGenerator<Date>;

export function randomTimestampWithinYears(years: number): ValueGenerator<Date>;

export function pickFrom<TValue>(items: readonly TValue[]): ValueGenerator<TValue>;

export function optional<TValue>(
  generator: ValueGenerator<TValue>,
  nullProbability?: number,
): ValueGenerator<TValue | null>;

export function selfReference<TValue>(options?: { nullProbability?: number }): ValueGenerator<TValue | null>;

export function sequence<TValue>(build: (index: number) => TValue): ValueGenerator<TValue>;

export function derive<TValue>(
  build: (row: Readonly<Record<string, unknown>>, context: GenerationContext) => TValue,
): ValueGenerator<TValue>;

export function unique<TValue>(
  generator: ValueGenerator<TValue>,
  options?: { maxAttempts?: number },
): ValueGenerator<TValue>;

export function weightedPick<TValue extends string>(weights: Record<TValue, number>): ValueGenerator<TValue>;

export function weightedPickFrom<TValue>(entries: readonly { value: TValue; weight: number }[]): ValueGenerator<TValue>;

export function zipfInteger(min: number, max: number, skew?: number): ValueGenerator<number>;

export function normalInteger(
  mean: number,
  stdDev: number,
  clamp?: { min: number; max: number },
): ValueGenerator<number>;
