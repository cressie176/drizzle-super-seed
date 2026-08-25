import {
  type TableRules,
  type ValueGenerator,
  constant,
  normalInteger,
  randomTimestampWithinYears,
  randomWords,
  sequence,
  weightedPick,
  weightedPickFrom,
  zipfInteger,
} from '../../lib/index';
import type * as schema from './park-schema';

const shapedParkRules = {
  name: randomWords({ minLength: 8, maxLength: 40 }),
  region: weightedPick({ 'south-west': 3, wales: 1 }),
  openedAt: sequence((index) => `2000-01-${index + 1}`),
  latitude: weightedPickFrom([
    { value: 50.4, weight: 3 },
    { value: 52.1, weight: 1 },
  ]),
  amenities: constant({ electricity: true }),
  active: weightedPickFrom([
    { value: true, weight: 9 },
    { value: false, weight: 1 },
  ]),
  createdAt: randomTimestampWithinYears(5),
} satisfies TableRules<typeof schema.parks>;

const shapedPitchRules = {
  id: zipfInteger(1, 1_000),
  parkId: zipfInteger(1, 60),
  reference: randomWords({ minLength: 8, maxLength: 20 }),
  areaSqm: normalInteger(80, 20, { min: 20, max: 200 }),
  hasElectricity: weightedPickFrom([
    { value: true, weight: 1 },
    { value: false, weight: 3 },
  ]),
} satisfies TableRules<typeof schema.pitches>;

const distributionOfTheWrongType = {
  ...shapedParkRules,
  // @ts-expect-error a shaped number generator does not satisfy a text column
  name: zipfInteger(1, 100),
} satisfies TableRules<typeof schema.parks>;

const weightsMustBeNumbers = {
  ...shapedParkRules,
  // @ts-expect-error weights are numbers, not descriptions
  region: weightedPick({ 'south-west': 'mostly', wales: 'sometimes' }),
} satisfies TableRules<typeof schema.parks>;

const weightedPickInfersTheKeys: ValueGenerator<'pending' | 'confirmed'> = weightedPick({
  pending: 1,
  confirmed: 9,
});

const weightedPickFromPreservesTheValueType: ValueGenerator<{ tier: string }> = weightedPickFrom([
  { value: { tier: 'gold' }, weight: 1 },
  { value: { tier: 'silver' }, weight: 4 },
]);

const zipfSkewIsOptional: ValueGenerator<number> = zipfInteger(20, 600, 1.4);

const normalClampIsOptional: ValueGenerator<number> = normalInteger(6, 4);

export {
  distributionOfTheWrongType,
  normalClampIsOptional,
  shapedParkRules,
  shapedPitchRules,
  weightedPickFromPreservesTheValueType,
  weightedPickInfersTheKeys,
  weightsMustBeNumbers,
  zipfSkewIsOptional,
};
