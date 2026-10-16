import { randomBytes } from 'node:crypto'
import { migrateDatabase, PostgresScanStore } from '@arablyzer/store'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresSotawStore } from '../../src/pg-store'
import type { SotawStore } from '../../src/store'
import { outcome } from '../fixtures'

// The crawl's tables on a real PostgreSQL (CI's service container, or ARABLYZER_TEST_DATABASE_URL
// locally), as the application role the crawl connects as: the migration's default privileges
// must reach the tables, the lock must keep a second crawl out, and a site must be taken once.
const databaseUrl = process.env.ARABLYZER_TEST_DATABASE_URL
const required = process.env.ARABLYZER_REQUIRE_SERVICES === '1'
if (required && databaseUrl === undefined)
  throw new Error('ARABLYZER_TEST_DATABASE_URL is required')

const suffix = randomBytes(4).toString('hex')
const ROLES = {
  appRole: `app_${suffix}`,
  migrateRole: `migrate_${suffix}`,
  workerRole: `worker_${suffix}`,
}
const RUN = { id: 'sotaw-test', frameId: 'T', frameSha: 'a'.repeat(64), seed: 's' }
const NOW = new Date('2026-10-20T10:00:00Z')
const sites = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    domain: `s${String(i)}.sa`,
    country: 'sa',
    rank: i + 1,
    position: n - i,
  }))

describe.skipIf(databaseUrl === undefined)('the crawl’s store, on PostgreSQL', () => {
  const appSecret = randomBytes(32).toString('hex')
  const workerSecret = randomBytes(32).toString('hex')
  const name = `arablyzer_test_${randomBytes(6).toString('hex')}`
  let admin: pg.Pool
  let app: pg.Pool
  let worker: pg.Pool
  let store: SotawStore

  const as = (role: string, secret: string) => {
    const url = new URL(databaseUrl ?? '')
    url.pathname = `/${name}`
    url.username = role
    url.password = secret
    return new pg.Pool({ connectionString: url.href, max: 4 })
  }

  beforeAll(async () => {
    const root = new pg.Client({ connectionString: databaseUrl })
    await root.connect()
    await root.query(`CREATE DATABASE ${name}`)
    await root.end()
    const url = new URL(databaseUrl ?? '')
    url.pathname = `/${name}`
    admin = new pg.Pool({ connectionString: url.href, max: 2 })
    await migrateDatabase(admin, { appPassword: appSecret, workerPassword: workerSecret, ...ROLES })
    app = as(ROLES.appRole, appSecret)
    worker = as(ROLES.workerRole, workerSecret)
    store = new PostgresSotawStore(app)
  })
  afterAll(async () => {
    await app.end()
    await worker.end()
    await admin.end()
    const root = new pg.Client({ connectionString: databaseUrl })
    await root.connect()
    await root.query(`DROP DATABASE IF EXISTS ${name}`)
    for (const role of Object.values(ROLES)) await root.query(`DROP ROLE IF EXISTS ${role}`)
    await root.end()
  })

  it('makes a run once, goes on with it, and refuses another frame', async () => {
    const run = await store.start(RUN, sites(5), NOW)
    expect(run).toMatchObject({ id: 'sotaw-test', total: 5, state: 'running' })
    await store.start(RUN, sites(5), NOW)
    expect(await store.counts('sotaw-test')).toMatchObject({ pending: 5 })
    await expect(store.start({ ...RUN, frameSha: 'b'.repeat(64) }, sites(5), NOW)).rejects.toThrow(
      /another frame/,
    )
  })

  it('takes the sites in the crawl’s order, each once, with an attempt spent', async () => {
    const first = await store.claim('sotaw-test', NOW)
    expect(first).toMatchObject({ domain: 's4.sa', state: 'running', attempts: 1, position: 1 })
    const second = await store.claim('sotaw-test', NOW)
    expect(second?.domain).toBe('s3.sa')
    expect((await store.running('sotaw-test')).map((r) => r.domain)).toEqual(['s4.sa', 's3.sa'])
  })

  it('keeps a compact outcome, a skip, a failure, a retry and a release', async () => {
    await store.attach('sotaw-test', 's4.sa', 'scan'.padEnd(22, '0'))
    await store.done('sotaw-test', 's4.sa', outcome({ 'ar-letter-spacing': 'f' }), NOW)
    await store.skip('sotaw-test', 's3.sa', 'robots', NOW)
    const third = await store.claim('sotaw-test', NOW)
    await store.retry('sotaw-test', third?.domain ?? '', 'scan-failed')
    const again = await store.claim('sotaw-test', NOW)
    expect(again).toMatchObject({ domain: third?.domain, attempts: 2 })
    await store.fail('sotaw-test', again?.domain ?? '', 'scan-failed', NOW)
    const fourth = await store.claim('sotaw-test', NOW)
    await store.release('sotaw-test', fourth?.domain ?? '')
    const rows = await store.results('sotaw-test')
    expect(rows.find((r) => r.domain === 's4.sa')).toMatchObject({
      state: 'done',
      outcome: { rules: { 'ar-letter-spacing': 'f' } },
      scanId: null,
    })
    expect(rows.find((r) => r.domain === 's3.sa')).toMatchObject({
      state: 'skipped',
      reason: 'robots',
    })
    expect(rows.find((r) => r.domain === third?.domain)).toMatchObject({
      state: 'failed',
      attempts: 2,
    })
    expect(rows.find((r) => r.domain === fourth?.domain)).toMatchObject({
      state: 'pending',
      attempts: 0,
    })
    expect(await store.counts('sotaw-test')).toMatchObject({
      done: 1,
      skipped: 1,
      failed: 1,
      pending: 2,
    })
  })

  it('puts back the sites that ended for one reason, in the same rows', async () => {
    await store.start({ ...RUN, id: 'sotaw-requeue' }, sites(4), NOW)
    for (const reason of ['robots-unreachable', 'robots', 'robots-unreachable']) {
      const taken = await store.claim('sotaw-requeue', NOW)
      await store.skip('sotaw-requeue', taken?.domain ?? '', reason, NOW)
    }
    expect(await store.requeue('sotaw-requeue', 'robots-unreachable')).toBe(2)
    expect(await store.requeue('sotaw-requeue', 'robots-unreachable')).toBe(0)
    const rows = await store.results('sotaw-requeue')
    expect(rows).toHaveLength(4)
    // In the crawl's order (the sites' positions run backwards here): s3, s2, s1, s0.
    expect(rows.map((r) => [r.domain, r.state, r.reason, r.attempts])).toEqual([
      ['s3.sa', 'pending', null, 0],
      ['s2.sa', 'skipped', 'robots', 1],
      ['s1.sa', 'pending', null, 0],
      ['s0.sa', 'pending', null, 0],
    ])
  })

  it('never hands one site to two crawlers at once', async () => {
    await store.start({ ...RUN, id: 'sotaw-race' }, sites(8), NOW)
    const taken = await Promise.all(Array.from({ length: 8 }, () => store.claim('sotaw-race', NOW)))
    expect(new Set(taken.map((r) => r?.domain)).size).toBe(8)
    expect(await store.claim('sotaw-race', NOW)).toBeNull()
  })

  it('holds one crawl at a time with an advisory lock, and lets go of it', async () => {
    const other = new PostgresSotawStore(app)
    expect(await store.lock()).toBe(true)
    expect(await other.lock()).toBe(false)
    await store.unlock()
    expect(await other.lock()).toBe(true)
    await other.unlock()
  })

  it('is closed to the worker’s role, and a scan the crawl makes is the application’s to delete', async () => {
    await expect(worker.query('SELECT count(*) FROM sotaw_results')).rejects.toThrow(
      /permission denied/,
    )
    const scans = new PostgresScanStore(app)
    await scans.create({
      id: 'scan'.padEnd(22, '1'),
      url: 'https://a.sa/',
      createdAt: NOW,
      deleteTokenHash: 'h'.repeat(64),
    })
    expect(await scans.delete('scan'.padEnd(22, '1'), 'h'.repeat(64))).toBe('deleted')
  })
})
