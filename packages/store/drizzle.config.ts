import { defineConfig } from 'drizzle-kit'

// `pnpm --filter @arablyzer/store exec drizzle-kit generate` writes a migration for a schema change.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/postgres/schema.ts',
  out: './drizzle',
})
