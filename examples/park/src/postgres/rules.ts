import { type SchemaRules, type TableRules, structuralDefault } from 'drizzle-super-seed';
import {
  amenities,
  cleaningFee,
  emailFor,
  homeModel,
  latitude,
  lettingStatus,
  monthlyFee,
  parkName,
  personName,
  pitchReference,
  region,
} from '../generators.ts';
import type * as schema from './schema.ts';

// `satisfies TableRules<typeof parks>` is what makes schema drift a compile error: add a column
// to the table and this object stops compiling until it has a rule.
export const parkRules = {
  name: parkName(),
  region: region(),
  openedAt: structuralDefault,
  latitude: latitude(),
  amenities: amenities(),
  active: true,
} satisfies TableRules<typeof schema.parks>;

export const pitchRules = {
  id: structuralDefault,
  parkId: structuralDefault,
  reference: pitchReference(),
  monthlyFee: monthlyFee(),
} satisfies TableRules<typeof schema.pitches>;

export const ownerRules = {
  id: structuralDefault,
  fullName: personName(),
  email: emailFor('fullName'),
  memberSince: structuralDefault,
  referredByOwnerId: structuralDefault,
} satisfies TableRules<typeof schema.owners>;

export const holidayHomeRules = {
  id: structuralDefault,
  pitchId: structuralDefault,
  ownerId: structuralDefault,
  model: homeModel(),
} satisfies TableRules<typeof schema.holidayHomes>;

export const lettingRules = {
  holidayHomeId: structuralDefault,
  guestName: personName(),
  status: lettingStatus(),
  startDate: structuralDefault,
  cleaningFee: cleaningFee(),
} satisfies TableRules<typeof schema.lettings>;

// `satisfies SchemaRules<typeof schema>` does the same for tables: add one to the schema module
// and this object stops compiling until it has a rules object.
export const rules = {
  parks: parkRules,
  pitches: pitchRules,
  owners: ownerRules,
  holidayHomes: holidayHomeRules,
  lettings: lettingRules,
} satisfies SchemaRules<typeof schema>;
