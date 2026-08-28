// LobeChat's schema is fetched rather than vendored. The upstream repository is under a custom
// licence, so redistributing its sources, or anything derived from them, is not ours to do:
// upstream/ and out/ are gitignored. The commit is pinned so the example is reproducible.
export const REPOSITORY = 'lobehub/lobe-chat';
export const COMMIT = '94d510b576c71e02847d3af45507f26fe7964ec9';

// Only the parts the schema modules actually need. goal.ts and verify.ts are taken from the real
// const package rather than stubbed, because their arrays are the declared values of pgEnum
// columns: inventing them would misrepresent the schema and the data generated for it.
export const WANTED_PATHS = [
  'packages/database/src/schemas',
  'packages/database/src/types',
  'packages/database/src/utils',
  'packages/const/src/goal.ts',
  'packages/const/src/verify.ts',
] as const;

export const tarballUrl = (): string => `https://codeload.github.com/${REPOSITORY}/tar.gz/${COMMIT}`;
