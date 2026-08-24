import {
  type TableRules,
  type ValueGenerator,
  constant,
  derive,
  optional,
  pickFrom,
  randomBoolean,
  randomDateBetween,
  randomDecimalString,
  randomInteger,
  randomTimestampWithinYears,
  randomUuid,
  randomWords,
  sequence,
  unique,
} from '../../lib/index';
import type * as schema from './park-schema';

const generatedParkRules = {
  name: randomWords({ minLength: 8, maxLength: 40 }),
  region: pickFrom(['south-west', 'wales']),
  openedAt: sequence((index) => `2000-01-${index + 1}`),
  latitude: optional(derive((_row, context) => context.random.next() * 90)),
  amenities: constant({ electricity: true }),
  active: randomBoolean(0.8),
  createdAt: randomTimestampWithinYears(5),
} satisfies TableRules<typeof schema.parks>;

const generatedPitchRules = {
  id: randomInteger(1, 1_000),
  parkId: randomInteger(1, 60),
  reference: unique(randomWords({ minLength: 8, maxLength: 20 })),
  areaSqm: optional(randomInteger(20, 200)),
  hasElectricity: randomBoolean(),
} satisfies TableRules<typeof schema.pitches>;

const generatorOfTheWrongType = {
  ...generatedParkRules,
  // @ts-expect-error a generator emitting the wrong type does not satisfy TableRules
  name: randomInteger(1, 100),
} satisfies TableRules<typeof schema.parks>;

const optionalOnANotNullColumn = {
  ...generatedParkRules,
  // @ts-expect-error optional() adds null to the value type, which a not null column rejects
  name: optional(randomWords()),
} satisfies TableRules<typeof schema.parks>;

const uuid: ValueGenerator<string> = randomUuid();

const decimalString: ValueGenerator<string> = randomDecimalString(0, 100, 2);

const openedAt: ValueGenerator<Date> = randomDateBetween(new Date('1965-01-01'), new Date('2020-12-31'));

const uniquePreservesTheValueType: ValueGenerator<number> = unique(randomInteger(1, 1_000));

const deriveReadsTheRowAsUnknown: ValueGenerator<number> = derive((row) => Number(row.latitude));

export {
  decimalString,
  deriveReadsTheRowAsUnknown,
  generatedParkRules,
  generatedPitchRules,
  generatorOfTheWrongType,
  openedAt,
  optionalOnANotNullColumn,
  uniquePreservesTheValueType,
  uuid,
};
