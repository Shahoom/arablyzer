import pg from 'pg'
import { POSTGRES_PROTOCOLS, productionUrl } from './connection'
import { APP_ROLE, migrateDatabase } from './postgres/provision'
import { requireSecret } from './secrets'

// The database's own step, run once by Compose before the API and the worker start, and again by
// hand where the database is not Compose's:
//
//   node --import tsx packages/store/src/migrate.ts
//
// DATABASE_URL is the bootstrap user's (a superuser, or a role that can create roles): the only
// process that holds it, and it is gone when this ends. ARABLYZER_APP_DATABASE_PASSWORD is the
// password the API and the worker connect with, as `arablyzer_app`; it is set on every run.
const env = process.env
const url = productionUrl('DATABASE_URL', env.DATABASE_URL, POSTGRES_PROTOCOLS)
const appPassword = requireSecret(
  'ARABLYZER_APP_DATABASE_PASSWORD',
  env.ARABLYZER_APP_DATABASE_PASSWORD,
)

const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 })
// A connection closed under it is told, not thrown; the run's own query fails as it should.
pool.on('error', (error) => {
  console.error(`PostgreSQL: ${error.message}`)
})
try {
  await migrateDatabase(pool, { appPassword })
  console.log(`The database is up to date, and ${APP_ROLE} may read, write and delete its scans`)
} finally {
  await pool.end()
}
