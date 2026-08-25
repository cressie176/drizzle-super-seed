import { createInMemoryGraphSink, generate } from '../../lib/index';
import type { DataGraph, SchemaRules } from '../../lib/index';
import * as schema from './park-schema';

type Expect<T extends true> = T;
type Exactly<TActual, TExpected> = [TActual] extends [TExpected]
  ? [TExpected] extends [TActual]
    ? true
    : false
  : false;

declare const typed: DataGraph<typeof schema>;
declare const untyped: DataGraph;

// A generated row carries every column, the GENERATED ALWAYS AS IDENTITY key included, so the
// row type is `$inferSelect` rather than the insert shape which omits it.
type ParkRow = (typeof typed.rows.parks)[number];
export type IdIsPresentAndNotOptional = Expect<Exactly<ParkRow['id'], number>>;
export type NullableColumnKeepsItsNull = Expect<Exactly<ParkRow['latitude'], number | null>>;
export type DefaultedColumnIsNotOptional = Expect<Exactly<ParkRow['active'], boolean>>;
export type DateColumnStaysAString = Expect<Exactly<ParkRow['openedAt'], string>>;
export type TimestampColumnStaysADate = Expect<Exactly<ParkRow['createdAt'], Date>>;

// Non-table exports are filtered out of the rows, exactly as they are out of the rules.
export type RowKeysAreTablesOnly = Expect<Exactly<keyof typeof typed.rows, 'parks' | 'pitches'>>;

// Without a schema type argument the graph is the string-keyed one it has always been.
export type UntypedRowsStayStringKeyed = Expect<
  Exactly<typeof untyped.rows, Record<string, Record<string, unknown>[]>>
>;
export type UntypedRowStaysUnknown = Expect<Exactly<(typeof untyped.rows)[string][number], Record<string, unknown>>>;

// @ts-expect-error `lodges` is not a table in this schema
type UnknownTable = (typeof typed.rows.lodges)[number];

export const children = typed.childrenOf('parks', typed.rows.parks[0], 'pitches');
export type ChildrenAreTypedByTheirKey = Expect<Exactly<(typeof children)[number]['areaSqm'], number | null>>;

// @ts-expect-error `lodges` is not a table in this schema
typed.childrenOf('parks', typed.rows.parks[0], 'lodges');

// The parent table is named as a type argument, since no drizzle type records where a foreign
// key points.
export const namedParent = typed.parentOf<'parks'>('pitches', typed.rows.pitches[0], 'parkId');
export type NamedParentIsThatTable = Expect<Exactly<typeof namedParent, ParkRow | null>>;

export const unnamedParent = typed.parentOf('pitches', typed.rows.pitches[0], 'parkId');
export type UnnamedParentIsTheRowUnion = Expect<
  Exactly<typeof unnamedParent, ParkRow | (typeof typed.rows.pitches)[number] | null>
>;

// The sink carries the schema type through `generate` to its result.
declare const rules: SchemaRules<typeof schema>;

export async function generated() {
  const data = await generate({ schema, rules, counts: { parks: 1 } }, createInMemoryGraphSink<typeof schema>());
  return data.rows.parks[0].name;
}

export type GeneratedNameIsAString = Expect<Exactly<Awaited<ReturnType<typeof generated>>, string>>;

export async function generatedWithoutSchemaType() {
  const data = await generate({ schema, rules, counts: { parks: 1 } }, createInMemoryGraphSink());
  return data.rows.parks[0].name;
}

export type UntypedGeneratedNameIsUnknown = Expect<
  Exactly<Awaited<ReturnType<typeof generatedWithoutSchemaType>>, unknown>
>;

// `UnknownTable` is declared only to be rejected above.
export type Unused = UnknownTable;
