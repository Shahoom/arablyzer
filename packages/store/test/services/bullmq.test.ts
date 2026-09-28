import { Worker } from 'bullmq'
import type { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BullMQScanQueue, SCAN_QUEUE, type ScanJob } from '../../src/index'
import { hasValkey, valkey } from './services'

describe.skipIf(!hasValkey)('BullMQ', () => {
  let redis: Redis
  let queue: BullMQScanQueue
  beforeAll(async () => {
    redis = await valkey()
    queue = new BullMQScanQueue(redis)
  })
  afterAll(async () => {
    await queue.close()
    await redis.quit()
  })

  it('queues each scan once, and hands it to a worker', async () => {
    const job = { id: 'AbCdEfGhIjKlMnOpQrSt_-', url: 'https://example.com/' }
    await queue.add(job)
    await queue.add(job)
    expect(await queue.waiting()).toBe(1)
    const taken: ScanJob[] = []
    const worker = new Worker<ScanJob>(
      SCAN_QUEUE,
      (next) => {
        taken.push(next.data)
        return Promise.resolve()
      },
      { connection: redis.duplicate(), concurrency: 1 },
    )
    try {
      for (let i = 0; i < 50 && taken.length === 0; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      expect(taken).toEqual([job])
      expect(await queue.waiting()).toBe(0)
    } finally {
      await worker.close()
    }
  })
})
