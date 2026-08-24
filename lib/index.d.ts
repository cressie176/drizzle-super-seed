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
  notNull: boolean;
  hasDatabaseDefault: boolean;
  isPrimaryKey: boolean;
  sequenceOwned: boolean;
  identityAlways: boolean;
  enumValues?: readonly string[];
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

export function sequence<TValue>(build: (index: number) => TValue): ValueGenerator<TValue>;

export function derive<TValue>(
  build: (row: Readonly<Record<string, unknown>>, context: GenerationContext) => TValue,
): ValueGenerator<TValue>;

export function unique<TValue>(
  generator: ValueGenerator<TValue>,
  options?: { maxAttempts?: number },
): ValueGenerator<TValue>;
