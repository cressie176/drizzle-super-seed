import type { PgTable } from 'drizzle-orm/pg-core';

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
}

export interface CanonicalColumn {
  name: string;
  propertyName: string;
  kind: ColumnKind;
  jsType: 'number' | 'string' | 'bigint' | 'boolean' | 'date' | 'json';
  notNull: boolean;
  hasDatabaseDefault: boolean;
  isPrimaryKey: boolean;
  sequenceOwned: boolean;
  identityAlways: boolean;
  enumValues?: readonly string[];
  maxValue?: number | bigint;
  maxLength?: number;
  precision?: number;
  scale?: number;
  withTimezone?: boolean;
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
  uniqueConstraints: string[][];
  drizzleTable: unknown;
}

export interface CanonicalSchema {
  tables: Map<string, CanonicalTable>;
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

export type ColumnRule<TValue> = ValueGenerator<TValue> | TValue | typeof structuralDefault;

export type TableRules<TTable extends PgTable> = {
  [K in keyof Required<TTable['$inferInsert']>]: ColumnRule<Required<TTable['$inferInsert']>[K]>;
};

export type SchemaRules<TSchema> = {
  [K in keyof TSchema as TSchema[K] extends PgTable ? K : never]: TSchema[K] extends PgTable
    ? TableRules<TSchema[K]>
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

export interface DataGraph {
  report: GenerationReport;
  rows: Record<string, Record<string, unknown>[]>;
  parentOf(
    childTableKey: string,
    childRow: Record<string, unknown>,
    foreignKeyColumn: string,
  ): Record<string, unknown> | null;
  childrenOf(
    parentTableKey: string,
    parentRow: Record<string, unknown>,
    childTableKey: string,
  ): Record<string, unknown>[];
}

export function createInMemoryGraphSink(): GenerationSink<DataGraph>;

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

export function createPostgresSqlFileSink(options: {
  directory: string;
  triggerHandling?: TriggerHandling;
}): GenerationSink<GenerationReport>;

export function createPostgresSqlStreamSink(options: {
  writable: NodeJS.WritableStream;
  triggerHandling?: TriggerHandling;
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
