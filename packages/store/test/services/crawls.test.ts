import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrateDatabase, PostgresCrawlData, PostgresScanStore } from '../../src/index'
import { crawlContract, NOW } from '../crawl-contract'
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

describe.skipIf(!hasPostgres)('deep crawls, on PostgreSQL', () => {
  const appSecret = password()
  const workerSecret = password()
  let drop: () => Promise<void>
  let app: pg.Pool
  let worker: pg.Pool
  let crawls: PostgresCrawlData

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
    crawls = new PostgresCrawlData(app)
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

  crawlContract(() => ({
    crawls,
    scan: (scanId) =>
      new PostgresScanStore(app)
        .create({ id: scanId, url: 'https://shop.example/', createdAt: NOW })
        .then(() => undefined),
    user: async (id) => {
      await app.query(
        'INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES ($1, $1, $2, true, $3, $3) ON CONFLICT DO NOTHING',
        [id, `${id}@example.com`, NOW],
      )
    },
    site: async (userId, siteId) => {
      await app.query(
        'INSERT INTO sites (id, user_id, url, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [siteId, userId, `https://${siteId}.example/`, NOW],
      )
    },
  }))

  it('closes the crawl tables to the worker’s role, and a removed site takes its crawls', async () => {
    for (const table of ['crawls', 'crawl_pages']) {
      await expect(worker.query(`SELECT count(*) FROM ${table}`), table).rejects.toThrow(
        /permission denied/,
      )
    }
    const userId = 'crawl-owner'.padEnd(22, '_')
    const siteId = 'crawl-site'.padEnd(22, '_')
    await app.query(
      'INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES ($1, $1, $2, true, $3, $3)',
      [userId, 'crawl-owner@example.com', NOW],
    )
    await app.query('INSERT INTO sites (id, user_id, url, created_at) VALUES ($1, $2, $3, $4)', [
      siteId,
      userId,
      'https://crawl.example/',
      NOW,
    ])
    const made = await crawls.create({
      id: 'crawl-one'.padEnd(22, '_'),
      userId,
      siteId,
      startUrl: 'https://crawl.example/',
      pageCap: 10,
      delayMs: 0,
      createdAt: NOW,
    })
    expect(made.kind).toBe('created')
    await app.query('DELETE FROM sites WHERE id = $1', [siteId])
    expect(await crawls.get('crawl-one'.padEnd(22, '_'))).toBeNull()
    // Deleting the account takes the rest by cascade.
    await app.query('DELETE FROM users WHERE id = $1', [userId])
  })
})
