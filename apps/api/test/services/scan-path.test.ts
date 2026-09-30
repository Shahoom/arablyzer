import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createPolicy } from '@arablyzer/egress'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import { DEVELOPMENT_LIMITS } from '@arablyzer/plans'
import type { Report } from '@arablyzer/report-schema'
import {
  BullMQScanQueue,
  PostgresScanStore,
  SCAN_QUEUE,
  ValkeyInFlight,
  ValkeyRateLimiter,
  ValkeyScanEvents,
  type ScanJob,
} from '@arablyzer/store'
import { localScanner } from '@arablyzer/scanner'
import { runScan } from '@arablyzer/worker'
import { Worker } from 'bullmq'
import { Redis } from 'ioredis'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { newScanId } from '../../src/ids'

// The whole path of one scan on the services Compose runs (M2.1 plan §4): the API on PostgreSQL
// and Valkey, BullMQ, and a worker running the real engine on a golden page.
const valkeyUrl = process.env.ARABLYZER_TEST_VALKEY_URL
const databaseUrl = process.env.ARABLYZER_TEST_DATABASE_URL
if (
  process.env.ARABLYZER_REQUIRE_SERVICES === '1' &&
  (valkeyUrl === undefined || databaseUrl === undefined)
) {
  throw new Error('ARABLYZER_TEST_VALKEY_URL and ARABLYZER_TEST_DATABASE_URL are required')
}

describe.skipIf(valkeyUrl === undefined || databaseUrl === undefined)('the scan path', () => {
  let site: FixtureSite
  let redis: Redis
  let pool: pg.Pool
  let dropDatabase: () => Promise<void>
  let worker: Worker<ScanJob>
  let queue: BullMQScanQueue
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    site = await serveSite(
      fileURLToPath(
        new URL('../../../../fixtures/golden/sites/20-clean-contact/', import.meta.url),
      ),
    )
    redis = new Redis(valkeyUrl ?? '', { db: 4, maxRetriesPerRequest: null })
    await redis.flushdb()
    const name = `arablyzer_path_${randomBytes(6).toString('hex')}`
    const admin = new pg.Client({ connectionString: databaseUrl })
    await admin.connect()
    await admin.query(`CREATE DATABASE ${name}`)
    await admin.end()
    const url = new URL(databaseUrl ?? '')
    url.pathname = `/${name}`
    pool = new pg.Pool({ connectionString: url.href, max: 4 })
    dropDatabase = async () => {
      await pool.end()
      const cleanup = new pg.Client({ connectionString: databaseUrl })
      await cleanup.connect()
      await cleanup.query(`DROP DATABASE IF EXISTS ${name}`)
      await cleanup.end()
    }
    const store = new PostgresScanStore(pool)
    await store.migrate()
    const events = new ValkeyScanEvents(redis, 200)
    queue = new BullMQScanQueue(redis)
    const policy = createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] })
    app = createApp({
      limits: DEVELOPMENT_LIMITS,
      policy,
      resolver: () => Promise.resolve([]),
      turnstile: () => Promise.resolve(true),
      limiter: new ValkeyRateLimiter(redis),
      store,
      queue,
      events,
      inFlight: new ValkeyInFlight(redis),
      address: () => '203.0.113.9',
      connectionKey: (address) => `test-${address}`,
      newId: newScanId,
    })
    worker = new Worker<ScanJob>(
      SCAN_QUEUE,
      (job) => runScan(job.data, { store, events, scanner: localScanner({ policy }) }),
      { connection: redis.duplicate(), concurrency: 1 },
    )
  })

  afterAll(async () => {
    await worker.close()
    await queue.close()
    redis.disconnect()
    await dropDatabase()
    await site.close()
  })

  it('goes from the form to the stored report, every step on the stream', async () => {
    const created = await app.request('/api/scans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: site.url('/'), turnstileToken: '' }),
    })
    expect(created.status).toBe(202)
    const { id } = (await created.json()) as { id: string }
    const stream = await (await app.request(`/api/scans/${id}/events`)).text()
    const types = stream
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => (JSON.parse(line.slice(5)) as { type: string }).type)
    expect(types[0]).toBe('queued')
    expect(types[1]).toBe('started')
    expect(types).toContain('page')
    expect(types).toContain('rules')
    expect(types.at(-1)).toBe('done')
    const report = (await (await app.request(`/api/reports/${id}`)).json()) as Report
    expect(report.target.url).toBe(site.url('/'))
    expect(report.scan.status).toBe('complete')
    expect(await (await app.request(`/api/scans/${id}`)).json()).toMatchObject({
      state: 'complete',
    })
  }, 60_000)
})
