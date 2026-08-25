import {
  type SchemaRules,
  type TableRules,
  derive,
  pickFrom,
  randomDecimalString,
  randomWords,
  sequence,
  structuralDefault,
  weightedPick,
} from 'drizzle-super-seed';
import type * as schema from './schema.ts';

const REGIONS = ['south-west', 'wales', 'north-east', 'east-anglia'] as const;

// `satisfies TableRules<typeof parks>` is what makes schema drift a compile error: add a column to
// the table and this object stops compiling until it has a rule.
export const parkRules = {
  name: derive((_row, context) => `${context.random.pick(['Sunny', 'Sandy', 'Green'])} Acres`),
  region: pickFrom(REGIONS),
  openedAt: structuralDefault,
  latitude: structuralDefault,
  amenities: structuralDefault,
  active: true,
} satisfies TableRules<typeof schema.parks>;

export const pitchRules = {
  id: structuralDefault,
  parkId: structuralDefault,
  reference: sequence((index) => `P${String(index + 1).padStart(4, '0')}`),
  monthlyFee: randomDecimalString(80, 400, 2),
} satisfies TableRules<typeof schema.pitches>;

export const ownerRules = {
  id: structuralDefault,
  fullName: randomWords({ minLength: 8, maxLength: 24 }),
  email: sequence((index) => `owner-${index}@example.com`),
  memberSince: structuralDefault,
  referredByOwnerId: structuralDefault,
} satisfies TableRules<typeof schema.owners>;

export const holidayHomeRules = {
  id: structuralDefault,
  pitchId: structuralDefault,
  ownerId: structuralDefault,
  model: pickFrom(['Bluebird', 'Lakeland', 'Willerby', 'Pemberton']),
} satisfies TableRules<typeof schema.holidayHomes>;

export const lettingRules = {
  holidayHomeId: structuralDefault,
  guestName: randomWords({ minLength: 8, maxLength: 24 }),
  status: weightedPick({ pending: 2, confirmed: 7, cancelled: 1 }),
  startDate: structuralDefault,
  cleaningFee: randomDecimalString(30, 90, 2),
} satisfies TableRules<typeof schema.lettings>;

// `satisfies SchemaRules<typeof schema>` does the same for tables: add one to the schema module and
// this object stops compiling until it has a rules object.
export const rules = {
  parks: parkRules,
  pitches: pitchRules,
  owners: ownerRules,
  holidayHomes: holidayHomeRules,
  lettings: lettingRules,
} satisfies SchemaRules<typeof schema>;
