import { faker } from '@faker-js/faker';
import { type ValueGenerator, derive } from 'drizzle-super-seed';

export const SEED = 42;

// One seed for both libraries, the pattern from the drizzle-super-seed README: rules evaluate
// in a deterministic order, so seeding faker once reproduces a whole run.
export const seedFaker = (seed: number): void => {
  faker.seed(seed);
};

seedFaker(SEED);

export const firstName = (): ValueGenerator<string> => derive(() => faker.person.firstName());
export const lastName = (): ValueGenerator<string> => derive(() => faker.person.lastName());
export const streetAddress = (): ValueGenerator<string> => derive(() => faker.location.streetAddress());
export const cityName = (): ValueGenerator<string> => derive(() => faker.location.city());
export const countryName = (): ValueGenerator<string> => derive(() => faker.location.country());
export const district = (): ValueGenerator<string> => derive(() => faker.location.county());
export const postalCode = (): ValueGenerator<string> => derive(() => faker.location.zipCode());
export const phoneNumber = (): ValueGenerator<string> => derive(() => faker.phone.number({ style: 'international' }));
export const filmTitle = (): ValueGenerator<string> => derive(() => faker.music.songName());
export const filmDescription = (): ValueGenerator<string> => derive(() => faker.lorem.sentences(2));
export const categoryName = (): ValueGenerator<string> => derive(() => faker.commerce.department());

// Emails derive from the row's own generated name, so the data reads as one person.
export const emailFor = (first: string, last: string): string =>
  `${`${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '')}@example.com`;
