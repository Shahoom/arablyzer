import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrateDatabase, PostgresAdminData } from '../../src/index'
import { adminContract, NOW } from '../admin-contract'
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
  return new pg.Pool({ connectionString: made.href, max: 8 })
}

describe.skipIf(!hasPostgres)('the owner’s panel data, on PostgreSQL', () => {
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

  adminContract(() => ({
    admin: new PostgresAdminData(app),
    user: async (input) => {
      await app.query(
        'INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES ($1, $2, $3, true, $4, $4)',
        [input.id, input.name, input.email, input.createdAt],
      )
    },
    scan: async (input) => {
      await app.query('INSERT INTO scans (id, url, state, created_at) VALUES ($1, $2, $3, $4)', [
        input.id,
        input.url,
        input.state,
        input.createdAt,
      ])
      if (input.userId !== undefined) {
        await app.query(
          "INSERT INTO account_scans (scan_id, user_id, source, created_at) VALUES ($1, $2, 'manual', $3)",
          [input.id, input.userId, input.createdAt],
        )
      }
    },
  }))

  it('closes both tables to the worker’s role, and the account’s erasure takes its state', async () => {
    for (const table of ['admin_user_state', 'admin_audit']) {
      await expect(worker.query(`SELECT * FROM ${table} LIMIT 0`), table).rejects.toThrow(
        /permission denied/,
      )
      await expect(worker.query(`DELETE FROM ${table}`), table).rejects.toThrow(/permission denied/)
    }
    const userId = 'state-owner'.padEnd(22, '_')
    await app.query(
      'INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES ($1, $1, $2, true, $3, $3)',
      [userId, `${userId}@example.com`, NOW],
    )
    await new PostgresAdminData(app).setSuspended(userId, NOW, NOW)
    await app.query('DELETE FROM users WHERE id = $1', [userId])
    const left = await app.query(
      'SELECT count(*)::int AS n FROM admin_user_state WHERE user_id = $1',
      [userId],
    )
    expect((left.rows[0] as { n: number }).n).toBe(0)
  })
})
