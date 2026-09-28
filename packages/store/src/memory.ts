import type { ScanEvent, ScanState } from '@arablyzer/api-contract'
import type { Report } from '@arablyzer/report-schema'
import type { ScanEvents, ScanJob, ScanQueue, ScanRecord, ScanStore, StoredEvent } from './types'

// The stores in memory, for tests and `pnpm dev`: one process, nothing kept after it ends.

export class MemoryScanStore implements ScanStore {
  readonly #scans = new Map<string, ScanRecord>()

  create(scan: { id: string; url: string; createdAt: Date }): Promise<void> {
    if (this.#scans.has(scan.id)) return Promise.reject(new Error(`Scan ${scan.id} exists`))
    this.#scans.set(scan.id, {
      ...scan,
      state: 'queued',
      startedAt: null,
      finishedAt: null,
      report: null,
    })
    return Promise.resolve()
  }

  get(id: string): Promise<ScanRecord | null> {
    return Promise.resolve(this.#scans.get(id) ?? null)
  }

  start(id: string, at: Date): Promise<boolean> {
    return this.#move(id, ['queued'], { state: 'running', startedAt: at })
  }

  finish(id: string, report: Report, at: Date): Promise<boolean> {
    return this.#move(id, ['running'], { state: report.scan.status, finishedAt: at, report })
  }

  fail(id: string, at: Date): Promise<boolean> {
    return this.#move(id, ['queued', 'running'], { state: 'failed', finishedAt: at })
  }

  async failStale(startedBefore: Date, at: Date): Promise<string[]> {
    const stale = [...this.#scans.values()].filter(
      (scan) =>
        scan.state === 'running' && scan.startedAt !== null && scan.startedAt < startedBefore,
    )
    for (const scan of stale) await this.fail(scan.id, at)
    return stale.map((scan) => scan.id)
  }

  /** The change, when the scan is in one of the states it moves from. */
  #move(id: string, from: readonly ScanState[], change: Partial<ScanRecord>): Promise<boolean> {
    const scan = this.#scans.get(id)
    if (scan === undefined || !from.includes(scan.state)) return Promise.resolve(false)
    this.#scans.set(id, { ...scan, ...change })
    return Promise.resolve(true)
  }
}

export class MemoryScanQueue implements ScanQueue {
  readonly #jobs: ScanJob[] = []
  readonly #takers: ((job: ScanJob) => void)[] = []
  readonly #added = new Set<string>()

  waiting(): Promise<number> {
    return Promise.resolve(this.#jobs.length)
  }

  add(job: ScanJob): Promise<void> {
    if (this.#added.has(job.id)) return Promise.resolve()
    this.#added.add(job.id)
    const taker = this.#takers.shift()
    if (taker !== undefined) taker(job)
    else this.#jobs.push(job)
    return Promise.resolve()
  }

  /** The next job, when there is one: for the worker that runs in this process. */
  take(signal: AbortSignal): Promise<ScanJob | null> {
    const job = this.#jobs.shift()
    if (job !== undefined) return Promise.resolve(job)
    return new Promise((resolve) => {
      const taker = (next: ScanJob) => {
        signal.removeEventListener('abort', onAbort)
        resolve(next)
      }
      const onAbort = () => {
        const index = this.#takers.indexOf(taker)
        if (index >= 0) this.#takers.splice(index, 1)
        resolve(null)
      }
      if (signal.aborted) {
        resolve(null)
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
      this.#takers.push(taker)
    })
  }
}

export class MemoryScanEvents implements ScanEvents {
  readonly #events = new Map<string, StoredEvent[]>()
  readonly #wakers = new Map<string, Set<() => void>>()

  /** How long a follower waits before it hears nothing: the stream's keep-alive. */
  readonly #heartbeatMs: number

  constructor(heartbeatMs = 15_000) {
    this.#heartbeatMs = heartbeatMs
  }

  publish(scanId: string, event: ScanEvent): Promise<string> {
    const list = this.#events.get(scanId) ?? []
    const stored = { id: String(list.length + 1), event }
    list.push(stored)
    this.#events.set(scanId, list)
    for (const wake of this.#wakers.get(scanId) ?? []) wake()
    return Promise.resolve(stored.id)
  }

  since(scanId: string, after: string | null): Promise<StoredEvent[]> {
    return Promise.resolve((this.#events.get(scanId) ?? []).slice(position(after)))
  }

  async *follow(
    scanId: string,
    after: string | null,
    signal: AbortSignal,
  ): AsyncGenerator<StoredEvent | null> {
    let next = position(after)
    while (!signal.aborted) {
      const list = this.#events.get(scanId) ?? []
      while (next < list.length) {
        const stored = list[next]
        next++
        if (stored !== undefined) yield stored
      }
      if (!(await this.#wait(scanId, signal))) yield null
    }
  }

  /** True when an event came, false when the heartbeat did, or the signal ended the wait. */
  #wait(scanId: string, signal: AbortSignal): Promise<boolean> {
    return new Promise((resolve) => {
      const wakers = this.#wakers.get(scanId) ?? new Set()
      this.#wakers.set(scanId, wakers)
      const done = (woke: boolean) => {
        clearTimeout(timer)
        wakers.delete(wake)
        signal.removeEventListener('abort', aborted)
        resolve(woke)
      }
      const wake = () => {
        done(true)
      }
      const aborted = () => {
        done(false)
      }
      const timer = setTimeout(() => {
        done(false)
      }, this.#heartbeatMs)
      wakers.add(wake)
      signal.addEventListener('abort', aborted, { once: true })
    })
  }
}

/** Where the events after an ID begin: IDs count from 1, and one that is not a count reads all. */
function position(after: string | null): number {
  const from = after === null ? 0 : Number(after)
  return Number.isSafeInteger(from) && from > 0 ? from : 0
}
