import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'mysql',
  schema: './upstream/schema.ts',
  out: './drizzle',
});
