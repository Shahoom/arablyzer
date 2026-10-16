import type { NlpTextJob, NlpTextResult } from '@arablyzer/api-contract/codes'
import { Queue, QueueEvents, Worker } from 'bullmq'
import type { Redis } from 'ioredis'

/** The queue of pasted texts the API hands the worker, which alone can reach the Arabic NLP service. */
export const NLP_QUEUE = 'arablyzer-nlp'
/** How long a visitor waits for the check: the service answers in about a second. */
export const NLP_WAIT_MS = 15_000

export interface NlpChecks {
  /** The service's answer for a text; `{ ok: false }` when none came in time (the worker or the service is away). */
  check(job: NlpTextJob): Promise<NlpTextResult>
  close(): Promise<void>
}

/**
 * Text checks over BullMQ, as a request and its answer: the API adds a job and waits for the worker's
 * return value. The job holds the pasted text, and is removed 30 seconds after it ends, answered or
 * not, so nothing a visitor pasted stays in Valkey.
 */
export class BullMQNlpChecks implements NlpChecks {
  readonly #queue: Queue<NlpTextJob, NlpTextResult>
  readonly #events: QueueEvents
  readonly #waitMs: number

  constructor(connection: Redis, waitMs = NLP_WAIT_MS) {
    this.#waitMs = waitMs
    this.#queue = new Queue<NlpTextJob, NlpTextResult>(NLP_QUEUE, {
      connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 30 },
        removeOnFail: { age: 30 },
      },
    })
    // Its blocking connection must never give up on a command (BullMQ refuses a client that does).
    this.#events = new QueueEvents(NLP_QUEUE, {
      connection: connection.duplicate({ maxRetriesPerRequest: null }),
    })
    this.#events.on('error', () => undefined)
  }

  async check(job: NlpTextJob): Promise<NlpTextResult> {
    try {
      const added = await this.#queue.add('text', job)
      return await added.waitUntilFinished(this.#events, this.#waitMs)
    } catch {
      return { ok: false }
    }
  }

  async close(): Promise<void> {
    await this.#events.close()
    await this.#queue.close()
  }
}

/** The worker's side: takes pasted texts two at a time and returns the answer to the API. */
export function nlpWorker(
  connection: Redis,
  handle: (job: NlpTextJob) => Promise<NlpTextResult>,
): Worker<NlpTextJob, NlpTextResult> {
  return new Worker<NlpTextJob, NlpTextResult>(NLP_QUEUE, (job) => handle(job.data), {
    connection,
    concurrency: 2,
    maxStalledCount: 0,
  })
}
