import { type CountRule, normalInteger, zipfInteger } from 'drizzle-super-seed';

export const testCounts: Record<string, CountRule> = {
  parks: 1,
  pitches: 2,
  owners: 2,
  holidayHomes: 1,
  lettings: 3,
};

// Production-shaped volumes: a few parks, a skewed number of pitches each, and a normal spread of
// lettings per holiday home.
export const productionCounts: Record<string, CountRule> = {
  parks: 20,
  pitches: { per: 'parks', count: zipfInteger(20, 600), retain: ['openedAt'] },
  owners: 5_000,
  holidayHomes: { per: 'pitches', count: normalInteger(1, 1, { min: 0, max: 2 }) },
  lettings: { per: 'holidayHomes', count: normalInteger(6, 4, { min: 0, max: 40 }) },
};
