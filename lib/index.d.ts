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
