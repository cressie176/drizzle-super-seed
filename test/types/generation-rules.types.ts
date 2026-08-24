import { type SchemaRules, type TableRules, structuralDefault } from '../../lib/index';
import type * as schema from './park-schema';

const completeParkRules = {
  name: (context) => `park ${context.rowIndex}`,
  region: 'south-west',
  openedAt: structuralDefault,
  latitude: (context) => context.random.next() * 90,
  amenities: { electricity: true },
  active: (context) => context.random.chance(0.5),
  createdAt: new Date('2020-01-01'),
} satisfies TableRules<typeof schema.parks>;

const completePitchRules = {
  id: structuralDefault,
  parkId: structuralDefault,
  reference: (context) => `pitch-${context.rowIndex}`,
  areaSqm: null,
  hasElectricity: true,
} satisfies TableRules<typeof schema.pitches>;

const missingNotNullColumn = {
  region: 'south-west',
  openedAt: structuralDefault,
  latitude: null,
  amenities: null,
  active: true,
  createdAt: new Date('2020-01-01'),
  // @ts-expect-error a rules object missing a not null column does not satisfy TableRules
} satisfies TableRules<typeof schema.parks>;

const missingNullableColumn = {
  name: 'Sunny Sands',
  region: 'south-west',
  openedAt: structuralDefault,
  amenities: null,
  active: true,
  createdAt: new Date('2020-01-01'),
  // @ts-expect-error a rules object missing a nullable column does not satisfy TableRules
} satisfies TableRules<typeof schema.parks>;

const missingDefaultedColumn = {
  name: 'Sunny Sands',
  region: 'south-west',
  openedAt: structuralDefault,
  latitude: null,
  amenities: null,
  createdAt: new Date('2020-01-01'),
  // @ts-expect-error a rules object missing a defaulted column does not satisfy TableRules
} satisfies TableRules<typeof schema.parks>;

const extraKey = {
  ...completeParkRules,
  // @ts-expect-error a rules object with a key which is not a column does not satisfy TableRules
  postcode: 'TR8 4LW',
} satisfies TableRules<typeof schema.parks>;

const literalOfTheWrongType = {
  ...completeParkRules,
  // @ts-expect-error a literal rule of the wrong type does not satisfy TableRules
  name: 42,
} satisfies TableRules<typeof schema.parks>;

const generatorOfTheWrongType = {
  ...completeParkRules,
  // @ts-expect-error a generator returning the wrong type does not satisfy TableRules
  name: () => 42,
} satisfies TableRules<typeof schema.parks>;

const completeSchemaRules = {
  parks: completeParkRules,
  pitches: completePitchRules,
} satisfies SchemaRules<typeof schema>;

const missingTableRules = {
  parks: completeParkRules,
  // @ts-expect-error a rules record missing a table does not satisfy SchemaRules
} satisfies SchemaRules<typeof schema>;

export {
  completeParkRules,
  completePitchRules,
  completeSchemaRules,
  extraKey,
  generatorOfTheWrongType,
  literalOfTheWrongType,
  missingDefaultedColumn,
  missingNotNullColumn,
  missingNullableColumn,
  missingTableRules,
};
