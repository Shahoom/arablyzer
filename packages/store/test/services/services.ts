import { randomBytes } from 'node:crypto'
import { Redis } from 'ioredis'
import pg from 'pg'

// The Valkey and PostgreSQL the store tests run against: CI's service containers, or local
// ones. ARABLYZER_REQUIRE_SERVICES=1 (CI) fails a run without them instead of skipping it.
const valkeyUrl = process.env.ARABLYZER_TEST_VALKEY_URL
const databaseUrl = process.env.ARABLYZER_TEST_DATABASE_URL
const required = process.env.ARABLYZER_REQUIRE_SERVICES === '1'

if (required && (valkeyUrl === undefined || databaseUrl === undefined)) {
  throw new Error('ARABLYZER_TEST_VALKEY_URL and ARABLYZER_TEST_DATABASE_URL are required')
}

export const hasValkey = valkeyUrl !== undefined
export const hasPostgres = databaseUrl !== undefined

/**
 * The logical database of each test file: vitest runs the files at once, and each empties its
 * own first, so one must never be another's (apps/api's scan path uses 4).
 */
export const VALKEY_DB = { valkey: 3, bullmq: 5 } as const

/** A connection to a file's own logical database, emptied first, so runs never share state. */
export async function valkey(db: number): Promise<Redis> {
  if (valkeyUrl === undefined) throw new Error('No ARABLYZER_TEST_VALKEY_URL')
  const redis = new Redis(valkeyUrl, { db, maxRetriesPerRequest: null })
  await redis.flushdb()
  return redis
}

/** A database of its own for one test file, dropped afterwards. */
export async function database(): Promise<{ pool: pg.Pool; drop: () => Promise<void> }> {
  if (databaseUrl === undefined) throw new Error('No ARABLYZER_TEST_DATABASE_URL')
  const name = `arablyzer_test_${randomBytes(6).toString('hex')}`
  const admin = new pg.Client({ connectionString: databaseUrl })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${name}`)
  await admin.end()
  const url = new URL(databaseUrl)
  url.pathname = `/${name}`
  const pool = new pg.Pool({ connectionString: url.href, max: 4 })
  return {
    pool,
    drop: async () => {
      await pool.end()
      const cleanup = new pg.Client({ connectionString: databaseUrl })
      await cleanup.connect()
      await cleanup.query(`DROP DATABASE IF EXISTS ${name}`)
      await cleanup.end()
    },
  }
}
