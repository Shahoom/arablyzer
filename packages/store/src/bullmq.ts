import { Queue, type WorkerOptions } from 'bullmq'
import type { Redis } from 'ioredis'
import type { ScanJob, ScanQueue } from './types'

/** The queue both the API and the worker name. */
export const SCAN_QUEUE = 'arablyzer-scans'

/**
 * How the worker takes scans: one at a time (BUILD-PLAN §11), and a scan whose worker died is
 * never run again: BullMQ fails it when it is next taken (maxStalledCount 0), and the worker's
 * `failed` handler fails the scan and tells its page (apps/worker).
 */
export const SCAN_WORKER = {
  concurrency: 1,
  maxStalledCount: 0,
} as const satisfies Omit<WorkerOptions, 'connection'>

/**
 * Scans in BullMQ, on Valkey. Each is tried once: a scan that fails is reported as failed, never
 * run again behind the visitor's back (with SCAN_WORKER, and the stores' one-way states). Once
 * run: a scan whose scanner was not there, as when it died or ended its process after a browser
 * scan and Compose is starting it again, has not run, and the worker asks again inside the job
 * (apps/worker, run.ts), so BullMQ's attempts stay one. Finished jobs are dropped; their reports
 * are in PostgreSQL.
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

  async add(job: ScanJob, options: { readonly priority?: number } = {}): Promise<void> {
    // The scan's ID is the job's, so the same scan is never queued twice. A job with a priority
    // waits behind every job without one, so the crawl of the Arabic web (M9) never delays a visitor.
    await this.#queue.add('scan', job, {
      jobId: job.id,
      ...(options.priority === undefined ? {} : { priority: options.priority }),
    })
  }

  /** Scans waiting or being run, those with a priority aside: whether a visitor is in the queue. */
  async busy(): Promise<number> {
    const counts = await this.#queue.getJobCounts('waiting', 'active')
    return (counts.waiting ?? 0) + (counts.active ?? 0)
  }

  close(): Promise<void> {
    return this.#queue.close()
  }
}
