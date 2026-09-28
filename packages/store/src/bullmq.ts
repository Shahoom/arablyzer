import { Queue } from 'bullmq'
import type { Redis } from 'ioredis'
import type { ScanJob, ScanQueue } from './types'

/** The queue both the API and the worker name. */
export const SCAN_QUEUE = 'arablyzer-scans'

/**
 * Scans in BullMQ, on Valkey. Each is tried once: a scan that fails is reported as failed, never
 * run again behind the visitor's back. Finished jobs are dropped; their reports are in PostgreSQL.
 */
export class BullMQScanQueue implements ScanQueue {
  readonly #queue: Queue<ScanJob>

  constructor(connection: Redis) {
    this.#queue = new Queue<ScanJob>(SCAN_QUEUE, {
      connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 60 * 60 },
        removeOnFail: { age: 24 * 60 * 60 },
      },
    })
  }

  waiting(): Promise<number> {
    return this.#queue.getWaitingCount()
  }

  async add(job: ScanJob): Promise<void> {
    // The scan's ID is the job's, so the same scan is never queued twice.
    await this.#queue.add('scan', job, { jobId: job.id })
  }

  close(): Promise<void> {
    return this.#queue.close()
  }
}
