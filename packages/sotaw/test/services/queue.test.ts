import { BullMQScanQueue, SCAN_QUEUE, SCAN_WORKER, type ScanJob } from '@arablyzer/store'
import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LOWEST_PRIORITY } from '../../src/config'

// The claim the crawl rests on, against a real BullMQ: a job with a priority waits behind every job
// without one, and `busy()` counts the visitors' scans (waiting or running) and not the crawl's
// that wait. CI's Valkey, or ARABLYZER_TEST_VALKEY_URL locally; db 6 is this file's own.
const valkeyUrl = process.env.ARABLYZER_TEST_VALKEY_URL
if (process.env.ARABLYZER_REQUIRE_SERVICES === '1' && valkeyUrl === undefined) {
  throw new Error('ARABLYZER_TEST_VALKEY_URL is required')
}

const job = (id: string): ScanJob => ({ id: id.padEnd(22, '0'), url: `https://${id}.sa/` })

describe.skipIf(valkeyUrl === undefined)('the scan queue, for the crawl', () => {
  let redis: Redis
  let queue: BullMQScanQueue
  beforeAll(async () => {
    redis = new Redis(valkeyUrl ?? '', { db: 6, maxRetriesPerRequest: null })
    await redis.flushdb()
    queue = new BullMQScanQueue(redis)
  })
  afterAll(async () => {
    await queue.close()
    await redis.flushdb()
    redis.disconnect()
  })

  it('counts a visitor’s scan as busy and the crawl’s waiting scan as not', async () => {
    expect(await queue.busy()).toBe(0)
    await queue.add(job('crawl1'), { priority: LOWEST_PRIORITY })
    expect(await queue.busy()).toBe(0)
    expect(await queue.waiting()).toBe(0)
    await queue.add(job('visitor1'))
    expect(await queue.busy()).toBe(1)
    expect(await queue.waiting()).toBe(1)
  })

  it('runs the visitors’ scans before the crawl’s, whatever came first, and busy sees a running one', async () => {
    await queue.add(job('visitor2'))
    await queue.add(job('crawl2'), { priority: LOWEST_PRIORITY })
    await queue.add(job('visitor3'))
    const order: string[] = []
    let sawBusyWhileRunning = false
    const worker = new Worker<ScanJob>(
      SCAN_QUEUE,
      async (taken) => {
        order.push(taken.data.url)
        if (order.length === 1) sawBusyWhileRunning = (await queue.busy()) >= 1
        await new Promise((resolve) => setTimeout(resolve, 20))
      },
      { connection: redis, ...SCAN_WORKER },
    )
    const raw = new Queue<ScanJob>(SCAN_QUEUE, { connection: redis })
    for (let i = 0; i < 100 && order.length < 5; i++) await new Promise((r) => setTimeout(r, 50))
    await worker.close()
    await raw.close()
    expect(order.slice(0, 3)).toEqual([
      'https://visitor1.sa/',
      'https://visitor2.sa/',
      'https://visitor3.sa/',
    ])
    expect(order.slice(3).sort()).toEqual(['https://crawl1.sa/', 'https://crawl2.sa/'])
    expect(sawBusyWhileRunning).toBe(true)
  })
})
