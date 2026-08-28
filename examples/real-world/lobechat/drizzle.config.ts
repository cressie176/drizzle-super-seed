import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './upstream/schemas/index.ts',
  out: './drizzle',
});
