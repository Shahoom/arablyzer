import { defineConfig } from 'drizzle-kit'

// `pnpm --filter @arablyzer/store exec drizzle-kit generate` writes a migration for a schema change.
export default defineConfig({
  dialect: 'postgresql',
  schema: [
    './src/postgres/schema.ts',
    './src/postgres/auth-schema.ts',
    './src/postgres/site-schema.ts',
    './src/postgres/monitor-schema.ts',
    './src/postgres/crawl-schema.ts',
  ],
  out: './drizzle',
})
