import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  migrateDatabase,
  PostgresAccountData,
  PostgresMonitorData,
  PostgresScanStore,
} from '../../src/index'
import { monitorContract, NOW, at } from '../monitor-contract'
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

describe.skipIf(!hasPostgres)('monitoring, on PostgreSQL', () => {
  const appSecret = password()
  const workerSecret = password()
  let drop: () => Promise<void>
  let app: pg.Pool
  let worker: pg.Pool
  let scans: PostgresScanStore
  let accounts: PostgresAccountData
  let monitors: PostgresMonitorData

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
    scans = new PostgresScanStore(app)
    accounts = new PostgresAccountData(app)
    monitors = new PostgresMonitorData(app)
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

  monitorContract(() => ({
    monitors,
    accounts,
    scans,
    user: async (id) => {
      await app.query(
        'INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES ($1, $1, $2, true, $3, $3) ON CONFLICT DO NOTHING',
        [id, `${id}@example.com`, NOW],
      )
    },
  }))

  it('closes the monitoring tables to the worker’s role, and a run goes with its scan', async () => {
    for (const table of ['monitors', 'monitor_runs', 'alert_settings']) {
      await expect(worker.query(`SELECT count(*) FROM ${table}`), table).rejects.toThrow(
        /permission denied/,
      )
    }
    const userId = 'run-owner'.padEnd(22, '_')
    await app.query(
      'INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES ($1, $1, $2, true, $3, $3)',
      [userId, 'run-owner@example.com', NOW],
    )
    const site = { id: 'run-site'.padEnd(22, '_'), url: 'https://run.example/', createdAt: NOW }
    await accounts.addSite(userId, site, 3)
    await monitors.enable(userId, site.id, { everyDays: 7, nextRunAt: at(1), createdAt: NOW }, 1)
    const scanId = 'run-scan'.padEnd(22, '_')
    await scans.create({ id: scanId, url: site.url, createdAt: at(-9) })
    await monitors.recordRun({
      userId,
      siteId: site.id,
      scanId,
      url: site.url,
      scheduledFor: at(-9),
      at: at(-9),
      everyDays: 7,
      nextRunAt: at(1),
    })
    // The worker's sweep deletes the scan; the run goes by cascade without the worker reading it.
    expect(await new PostgresScanStore(worker).deleteOlderThan(at(-5), 'linked')).toBeGreaterThan(0)
    const { rows } = await app.query(
      'SELECT count(*)::int AS n FROM monitor_runs WHERE scan_id = $1',
      [scanId],
    )
    expect((rows[0] as { n: number }).n).toBe(0)
  })
})
