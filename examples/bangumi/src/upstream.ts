// Bangumi's schema module is fetched rather than vendored. The upstream repository carries no
// licence, so redistributing its schema, or anything derived from it, is not ours to do: upstream/,
// drizzle/ and out/ are all gitignored. The commit is pinned so the example is reproducible.
export const REPOSITORY = 'bangumi/server-private';
export const COMMIT = '9db6475d9b7726b6521c384cf97f9299f801a37d';
export const SCHEMA_PATH = 'drizzle/schema.ts';

export const schemaUrl = (): string => `https://raw.githubusercontent.com/${REPOSITORY}/${COMMIT}/${SCHEMA_PATH}`;
