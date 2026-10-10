import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrateDatabase, PostgresAccountData, PostgresScanStore } from '../../src/index'
import { database, hasPostgres } from './services'

const suffix = randomBytes(4).toString('hex')
const ROLES = {
  appRole: `app_${suffix}`,
  migrateRole: `migrate_${suffix}`,
  workerRole: `worker_${suffix}`,
}
const password = () => randomBytes(32).toString('hex')
const NOW = new Date('2026-10-09T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const AGO = (days: number) => new Date(NOW.getTime() - days * DAY)
const as = (role: string, secret: string, url: URL) => {
  const made = new URL(url)
  made.username = role
  made.password = secret
  return new pg.Pool({ connectionString: made.href, max: 12 })
}

describe.skipIf(!hasPostgres)('sites and the scans an account keeps, on PostgreSQL', () => {
  const appSecret = password()
  const workerSecret = password()
  let drop: () => Promise<void>
  let app: pg.Pool
  let worker: pg.Pool
  let data: PostgresAccountData
  let scans: PostgresScanStore

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
    data = new PostgresAccountData(app)
    scans = new PostgresScanStore(app)
    for (const id of ['u1', 'u2', 'u3']) {
      await app.query(
        'INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES ($1, $1, $2, true, $3, $3)',
        [id, `${id}@example.com`, NOW],
      )
    }
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

  const site = (n: number) => ({
    id: `site-${n}`.padEnd(8, '0'),
    url: `https://example.com/${n}`,
    createdAt: new Date(NOW.getTime() + n),
  })
  const scan = async (id: string, createdAt: Date) =>
    scans.create({ id: id.padEnd(22, '_'), url: 'https://example.com/1', createdAt })

  it('holds a person to the limit when twelve adds arrive at once', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, n) => data.addSite('u1', site(n + 100), 5)),
    )
    expect(results.filter((r) => r.kind === 'added')).toHaveLength(5)
    expect(results.filter((r) => r.kind === 'limit')).toHaveLength(7)
    expect(await data.sites('u1')).toHaveLength(5)
  })

  it('saves a URL once, even past the limit, and keeps each person their own', async () => {
    const [first] = await data.sites('u1')
    expect(first).toBeDefined()
    const again = await data.addSite(
      'u1',
      { id: 'other-id', url: first?.url ?? '', createdAt: NOW },
      5,
    )
    expect(again).toMatchObject({ kind: 'existing', site: { id: first?.id } })
    expect((await data.addSite('u2', site(500), 5)).kind).toBe('added')
    expect(await data.site('u2', first?.id ?? '')).toBeNull()
    expect(await data.removeSite('u2', first?.id ?? '')).toBe(false)
  })

  it('links a scan to the site with its URL, lists the history, and keeps it past the site', async () => {
    const saved = await data.addSite('u3', site(600), 5)
    expect(saved.kind).toBe('added')
    await scan('mine-1', AGO(2))
    await scan('mine-2', AGO(1))
    for (const [id, at] of [
      ['mine-1', AGO(2)],
      ['mine-2', AGO(1)],
    ] as const) {
      await data.link({
        userId: 'u3',
        scanId: id.padEnd(22, '_'),
        url: site(600).url,
        source: 'manual',
        createdAt: at,
      })
    }
    const history = await data.history('u3', 10)
    expect(history.map((h) => h.scanId)).toEqual([
      'mine-2'.padEnd(22, '_'),
      'mine-1'.padEnd(22, '_'),
    ])
    expect(history[0]?.siteId).toBe(site(600).id)
    expect((await data.latestPerSite('u3')).get(site(600).id)?.scanId).toBe(
      'mine-2'.padEnd(22, '_'),
    )
    expect(await data.removeSite('u3', site(600).id)).toBe(true)
    expect((await data.history('u3', 10)).map((h) => h.siteId)).toEqual([null, null])
  })

  it('leaves the scans an account keeps to the plan, and takes the rest by the global days', async () => {
    await scan('anon-old', AGO(40))
    await scan('anon-new', AGO(1))
    await scan('kept-old', AGO(40))
    await scan('kept-newer', AGO(10))
    for (const [id, at] of [
      ['kept-old', AGO(40)],
      ['kept-newer', AGO(10)],
    ] as const) {
      await data.link({
        userId: 'u2',
        scanId: id.padEnd(22, '_'),
        url: 'https://elsewhere.example/',
        source: 'manual',
        createdAt: at,
      })
    }
    // The worker's role does both sweeps, and reads which scans are linked without reading whose.
    const sweeper = new PostgresScanStore(worker)
    expect(await sweeper.deleteOlderThan(AGO(30))).toBe(1) // anon-old only
    expect(await scans.get('kept-old'.padEnd(22, '_'))).not.toBeNull()
    expect(await sweeper.deleteOlderThan(AGO(30), 'linked')).toBe(1) // kept-old only
    expect(await scans.get('kept-old'.padEnd(22, '_'))).toBeNull()
    expect(await scans.get('kept-newer'.padEnd(22, '_'))).not.toBeNull()
    expect(await scans.get('anon-new'.padEnd(22, '_'))).not.toBeNull()
    // Its link went with the scan.
    const { rows } = await app.query(
      'SELECT count(*)::int AS n FROM account_scans WHERE scan_id = $1',
      ['kept-old'.padEnd(22, '_')],
    )
    expect(rows).toEqual([{ n: 0 }])
  })

  it("reads a site's score points and the links of a person's scans out of the reports", async () => {
    await app.query("DELETE FROM sites WHERE user_id = 'u3'")
    const own = { id: 'pts-site'.padEnd(22, '0'), url: 'https://points.example/', createdAt: NOW }
    await data.addSite('u3', own, 5)
    const made = async (n: number, days: number, source: 'manual' | 'monitor') => {
      const id = `pts-${n}`.padEnd(22, '_')
      await scans.create({ id, url: own.url, createdAt: AGO(days) })
      await scans.start(id, AGO(days))
      await scans.finish(
        id,
        {
          scan: { status: 'complete' },
          score: { overall: 60 + n, categories: { speed: 50 + n, rtl: null } },
          findings: [{ severity: 'critical', fingerprint: `${n}`.repeat(16) }],
        } as never,
        AGO(days),
      )
      await data.link({ userId: 'u3', scanId: id, url: own.url, source, createdAt: AGO(days) })
      return id
    }
    const a = await made(1, 40, 'manual')
    const b = await made(2, 5, 'monitor')
    const c = await made(3, 1, 'manual')
    const points = await data.scorePoints('u3', own.id, AGO(30), 10)
    expect(points.map((p) => [p.scanId, p.source, p.score])).toEqual([
      [b, 'monitor', 62],
      [c, 'manual', 63],
    ])
    expect(points[0]).toMatchObject({
      categories: { speed: 52, rtl: null },
      criticals: ['2222222222222222'],
    })
    expect((await data.scorePoints('u3', own.id, AGO(60), 2)).map((p) => p.scanId)).toEqual([b, c])
    expect(await data.scorePoints('u1', own.id, AGO(60), 10)).toEqual([])
    const kept = await data.linkedScans('u3', [a, 'x'.repeat(22)])
    expect([...kept.keys()]).toEqual([a])
    expect(await data.linkedScans('u1', [a])).toEqual(new Map())
    expect(await data.linkedScans('u3', [])).toEqual(new Map())
  })

  it('erases the scans of an account, and its sites and links go with the account', async () => {
    await data.eraseUser('u2')
    expect(await scans.get('kept-newer'.padEnd(22, '_'))).toBeNull()
    await app.query("DELETE FROM users WHERE id = 'u2'")
    for (const table of ['sites', 'account_scans']) {
      const { rows } = await app.query(
        `SELECT count(*)::int AS n FROM ${table} WHERE user_id = 'u2'`,
      )
      expect(rows, table).toEqual([{ n: 0 }])
    }
  })
})
