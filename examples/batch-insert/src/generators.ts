import { faker } from '@faker-js/faker';
import { type ValueGenerator, derive, pickFrom, randomDecimalString, sequence, weightedPick } from 'drizzle-super-seed';

export const SEED = 42;

// The faker pattern from the drizzle-super-seed README: one seed, given to faker once and to
// generate() explicitly. Rules evaluate in a deterministic order for a fixed configuration, so a
// single upfront seed reproduces a whole run. The sharp edge: faker's stream continues across
// runs within one process, so anything calling generate() more than once must re-seed between
// runs — the tests do.
export const seedFaker = (seed: number): void => {
  faker.seed(seed);
};

seedFaker(SEED);

const PARK_SUFFIXES = ['Park', 'Meadows', 'Sands', 'Acres', 'Retreat'];

export const parkName = (): ValueGenerator<string> =>
  derive(() => `${faker.location.city()} ${faker.helpers.arrayElement(PARK_SUFFIXES)}`);

export const region = () => weightedPick({ 'south-west': 0.4, wales: 0.3, 'north-east': 0.2, 'east-anglia': 0.1 });

// A believable UK latitude, rather than the structural default's arbitrary double.
export const latitude = (): ValueGenerator<number> => derive(() => faker.location.latitude({ min: 49.9, max: 58.6 }));

const AMENITIES = ['wifi', 'pool', 'electricity', 'shop', 'laundry', 'playground'];

export const amenities = (): ValueGenerator<string[]> =>
  derive(() => faker.helpers.arrayElements(AMENITIES, { min: 1, max: 4 }));

export const personName = (): ValueGenerator<string> => derive(() => faker.person.fullName());

// Derived from the name generated earlier in the row, with the row index guaranteeing uniqueness
// against the owners.email unique constraint.
export const emailFor = (nameColumn: string): ValueGenerator<string> =>
  derive((row, context) => {
    const name = String(row[nameColumn])
      .toLowerCase()
      .replace(/[^a-z]+/g, '.');
    return `${name}.${context.rowIndex}@example.com`;
  });

export const pitchReference = (): ValueGenerator<string> =>
  sequence((index) => `P${String(index + 1).padStart(4, '0')}`);

export const monthlyFee = (): ValueGenerator<string> => randomDecimalString(80, 400, 2);

export const cleaningFee = (): ValueGenerator<string> => randomDecimalString(30, 90, 2);

export const homeModel = () =>
  pickFrom(['Bluebird Sheraton', 'Willerby Manor', 'Pemberton Abingdon', 'Swift Moselle', 'ABI Beaumont']);

export const lettingStatus = () => weightedPick({ pending: 2, confirmed: 7, cancelled: 1 });
