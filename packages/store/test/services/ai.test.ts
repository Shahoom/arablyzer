import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrateDatabase, PostgresAiData } from '../../src/index'
import { aiContract, NOW } from '../ai-contract'
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

describe.skipIf(!hasPostgres)('the fix assistant’s ledger and answers, on PostgreSQL', () => {
  const appSecret = password()
  const workerSecret = password()
  let drop: () => Promise<void>
  let app: pg.Pool
  let worker: pg.Pool
  let ai: PostgresAiData

  const user = async (id: string) => {
    await app.query(
      'INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES ($1, $1, $2, true, $3, $3) ON CONFLICT DO NOTHING',
      [id, `${id}@example.com`, NOW],
    )
  }

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
    ai = new PostgresAiData(app)
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

  aiContract(() => ({
    ai,
    user,
    reset: async () => {
      await app.query('DELETE FROM ai_requests')
      await app.query('DELETE FROM ai_fix_cache')
    },
  }))

  it('closes both tables to the worker’s role', async () => {
    for (const table of ['ai_requests', 'ai_fix_cache']) {
      await expect(worker.query(`SELECT count(*) FROM ${table}`), table).rejects.toThrow(
        /permission denied/,
      )
    }
  })

  it('keeps the cost of an erased account’s requests and not whose they were', async () => {
    const userId = 'ai-erase-user'.padEnd(22, '_')
    await user(userId)
    const id = 'ai-erase-req'.padEnd(22, '_')
    await ai.reserve({
      id,
      userId,
      ruleId: 'img-alt',
      at: NOW,
      worstMicro: 10,
      perDay: 5,
      maxPending: 2,
      dailyCapMicro: null,
      monthlyCapMicro: null,
    })
    await ai.settle(
      id,
      {
        model: 'm',
        inputTokens: 1,
        outputTokens: 1,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costMicro: 42,
      },
      NOW,
    )
    await app.query('DELETE FROM users WHERE id = $1', [userId])
    const { rows } = await app.query<{ user_id: string | null; cost_micro: string }>(
      'SELECT user_id, cost_micro FROM ai_requests WHERE id = $1',
      [id],
    )
    expect(rows).toEqual([{ user_id: null, cost_micro: '42' }])
  })

  it('passes none of a cap to twelve requests that arrive at once on separate connections', async () => {
    await app.query('DELETE FROM ai_requests')
    const people = await Promise.all(
      Array.from({ length: 12 }, async (_, n) => {
        const person = `ai-race-${String(n)}`.padEnd(22, '_')
        await user(person)
        return person
      }),
    )
    const results = await Promise.all(
      people.map((userId, n) =>
        ai.reserve({
          id: `ai-race-req-${String(n)}`.padEnd(22, '_'),
          userId,
          ruleId: 'img-alt',
          at: NOW,
          worstMicro: 300,
          perDay: 5,
          maxPending: 2,
          dailyCapMicro: 1000,
          monthlyCapMicro: 100_000,
        }),
      ),
    )
    expect(results.filter((r) => r.kind === 'reserved')).toHaveLength(3)
    expect((await ai.spent(NOW)).day).toBe(900)
  })
})
