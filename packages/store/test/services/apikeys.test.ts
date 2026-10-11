import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrateDatabase, PostgresApiKeyData } from '../../src/index'
import { apiKeyContract, NOW } from '../apikey-contract'
import { database, hasPostgres } from './services'

const suffix = randomBytes(4).toString('hex')
const ROLES = {
  appRole: `app_${suffix}`,
  migrateRole: `migrate_${suffix}`,
  workerRole: `worker_${suffix}`,
}
const password = () => randomBytes(32).toString('hex')
const as = (role: string, secret: string, url: URL) => {
  const made = new URL(url)
  made.username = role
  made.password = secret
  return new pg.Pool({ connectionString: made.href, max: 12 })
}

describe.skipIf(!hasPostgres)('API keys, on PostgreSQL', () => {
  const appSecret = password()
  const workerSecret = password()
  let drop: () => Promise<void>
  let app: pg.Pool
  let worker: pg.Pool

  beforeAll(async () => {
    const made = await database()
    drop = made.drop
    await migrateDatabase(made.pool, {
      appPassword: appSecret,
      workerPassword: workerSecret,
      ...ROLES,
    })
    app = as(ROLES.appRole, appSecret, made.url)
    worker = as(ROLES.workerRole, workerSecret, made.url)
  })
  afterAll(async () => {
    await app.end()
    await worker.end()
    await drop()
    const cleanup = new pg.Client({ connectionString: process.env.ARABLYZER_TEST_DATABASE_URL })
    await cleanup.connect()
    for (const role of Object.values(ROLES)) await cleanup.query(`DROP ROLE IF EXISTS ${role}`)
    await cleanup.end()
  })

  apiKeyContract(() => ({
    keys: new PostgresApiKeyData(app),
    user: async (id) => {
      await app.query(
        'INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES ($1, $1, $2, true, $3, $3) ON CONFLICT DO NOTHING',
        [id, `${id}@example.com`, NOW],
      )
    },
  }))

  it('closes the key table to the worker’s role, and deleting the account takes the keys', async () => {
    await expect(worker.query('SELECT count(*) FROM api_keys')).rejects.toThrow(/permission denied/)
    const userId = 'key-owner'.padEnd(22, '_')
    await app.query(
      'INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES ($1, $1, $2, true, $3, $3)',
      [userId, `${userId}@example.com`, NOW],
    )
    await new PostgresApiKeyData(app).create(
      {
        id: 'k'.padEnd(22, '_'),
        userId,
        name: 'x',
        prefix: 'arb_abcd',
        hash: 'f'.repeat(64),
        createdAt: NOW,
      },
      2,
    )
    await app.query('DELETE FROM users WHERE id = $1', [userId])
    const left = await app.query('SELECT count(*)::int AS n FROM api_keys WHERE user_id = $1', [
      userId,
    ])
    expect((left.rows[0] as { n: number }).n).toBe(0)
  })
})
