// Rules for the repaired Pagila module. The ids carry default(nextval(...)) - drizzle-kit
// pull's rendering of a serial - which the engine recognises as sequence-owned, so
// structuralDefault would number them too; the explicit row numbers also serve
// store.managerStaffId, whose foreign key the pull dropped (see schema.ts).
import {
  type SchemaRules,
  derive,
  pickFrom,
  randomDateBetween,
  randomDecimalString,
  randomInteger,
  structuralDefault,
} from 'drizzle-super-seed';
import {
  categoryName,
  cityName,
  countryName,
  district,
  emailFor,
  filmDescription,
  filmTitle,
  firstName,
  lastName,
  phoneNumber,
  postalCode,
  streetAddress,
} from './generators.ts';
import type * as schema from './schema.ts';

const rowNumber = derive((_row, context) => context.rowIndex + 1);

// The ids carry default(nextval(...)) rather than serial, so the engine does not own them;
// explicit row numbers keep them dense and the foreign key pools warm.
export const rules = {
  country: { countryId: rowNumber, country: countryName(), lastUpdate: structuralDefault },
  city: { cityId: rowNumber, city: cityName(), countryId: structuralDefault, lastUpdate: structuralDefault },
  address: {
    addressId: rowNumber,
    address: streetAddress(),
    address2: structuralDefault,
    district: district(),
    cityId: structuralDefault,
    postalCode: postalCode(),
    phone: phoneNumber(),
    lastUpdate: structuralDefault,
  },
  language: {
    languageId: rowNumber,
    name: pickFrom(['English', 'Italian', 'Japanese', 'Mandarin', 'French', 'German']),
    lastUpdate: structuralDefault,
  },
  category: { categoryId: rowNumber, name: categoryName(), lastUpdate: structuralDefault },
  actor: {
    actorId: rowNumber,
    firstName: firstName(),
    lastName: lastName(),
    lastUpdate: structuralDefault,
  },
  film: {
    filmId: rowNumber,
    title: filmTitle(),
    description: filmDescription(),
    releaseYear: randomInteger(1901, 2025), // the year domain's CHECK range floor
    languageId: structuralDefault,
    originalLanguageId: structuralDefault,
    rentalDuration: randomInteger(3, 7),
    rentalRate: randomDecimalString(0.99, 6.99, 2),
    length: randomInteger(60, 200),
    replacementCost: randomDecimalString(9.99, 29.99, 2),
    rating: structuralDefault,
    lastUpdate: structuralDefault,
    // tsvector via the customType contract: the rule supplies the text form the column accepts.
    fulltext: derive((_row, context) => `'film':1 'seed':${(context.rowIndex % 9) + 2}`),
  },
  filmActor: { actorId: structuralDefault, filmId: structuralDefault, lastUpdate: structuralDefault },
  filmCategory: { filmId: structuralDefault, categoryId: structuralDefault, lastUpdate: structuralDefault },
  store: {
    storeId: rowNumber,
    // The pull silently dropped the cyclic FK, so this is a plain integer: point it at a staff
    // row number that will exist. The load runs with FK checks disabled, and by its end the
    // referenced rows are present, exactly as pagila's own dump relies on.
    managerStaffId: rowNumber,
    addressId: structuralDefault,
    lastUpdate: structuralDefault,
  },
  staff: {
    staffId: rowNumber,
    firstName: firstName(),
    lastName: lastName(),
    addressId: structuralDefault,
    email: derive((staff) => emailFor(String(staff.firstName), String(staff.lastName))),
    storeId: structuralDefault,
    active: structuralDefault,
    username: derive((staff) => String(staff.email).split('@')[0]),
    password: structuralDefault,
    lastUpdate: structuralDefault,
  },
  inventory: {
    inventoryId: rowNumber,
    filmId: structuralDefault,
    storeId: structuralDefault,
    lastUpdate: structuralDefault,
  },
  customer: {
    customerId: rowNumber,
    storeId: structuralDefault,
    firstName: firstName(),
    lastName: lastName(),
    email: derive((customer) => emailFor(String(customer.firstName), String(customer.lastName))),
    addressId: structuralDefault,
    activebool: structuralDefault,
    createDate: structuralDefault,
    lastUpdate: structuralDefault,
    active: randomInteger(0, 1),
    uuid: structuralDefault,
  },
  rental: {
    rentalId: rowNumber,
    rentalDate: derive((_row, context) => new Date(Date.UTC(2022, 0, 1) + context.rowIndex * 61_000).toISOString()),
    inventoryId: structuralDefault,
    customerId: structuralDefault,
    returnDate: structuralDefault,
    staffId: structuralDefault,
    lastUpdate: structuralDefault,
    uuid: structuralDefault,
  },
  paymentP202201: {
    paymentId: rowNumber,
    customerId: structuralDefault,
    staffId: structuralDefault,
    rentalId: structuralDefault,
    amount: randomDecimalString(0.99, 11.99, 2),
    // The partition holds January 2022 only; a structural default would land outside its bounds.
    paymentDate: derive((row, context) => {
      const window = randomDateBetween(new Date('2022-01-01T00:00:00Z'), new Date('2022-01-31T23:00:00Z'));
      return (window(context) as Date).toISOString();
    }),
    uuid: structuralDefault,
  },
} satisfies SchemaRules<typeof schema>;

export const counts = {
  country: 30,
  city: 120,
  address: 400,
  language: 6,
  category: 16,
  actor: 200,
  film: 1000,
  filmActor: 4000,
  filmCategory: 1500,
  store: 3,
  staff: 9,
  inventory: 3000,
  customer: 500,
  rental: 8000,
  paymentP202201: 6000,
};
