import type { Outcome } from './outcome'

export type ResultState = 'pending' | 'running' | 'done' | 'skipped' | 'failed'
export type RunState = 'running' | 'finished' | 'aborted'

export interface ResultRow {
  readonly runId: string
  readonly domain: string
  readonly country: string
  readonly rank: number
  readonly position: number
  readonly state: ResultState
  readonly reason: string | null
  readonly attempts: number
  readonly scanId: string | null
  readonly outcome: Outcome | null
}

export interface RunRow {
  readonly id: string
  readonly frameId: string
  readonly frameSha: string
  readonly seed: string
  readonly state: RunState
  readonly total: number
  readonly createdAt: Date
  readonly finishedAt: Date | null
}

export interface NewRun {
  readonly id: string
  readonly frameId: string
  readonly frameSha: string
  readonly seed: string
}

export interface NewResult {
  readonly domain: string
  readonly country: string
  readonly rank: number
  readonly position: number
}

/**
 * The crawl's state (tables `sotaw_runs` and `sotaw_results`), so that it can stop at any moment and
 * go on: a site is pending, running (a crawler took it and has not written its end), or ended
 * (done with an outcome, skipped, or failed), and a crawler that died leaves its sites running.
 */
export interface SotawStore {
  /**
   * Makes the run and its sites, or, when the run is there, goes on with it: the same frame (its
   * hash) is required, and a site already in it is left as it is.
   */
  start(run: NewRun, sites: readonly NewResult[], at: Date): Promise<RunRow>
  run(id: string): Promise<RunRow | null>
  /** The sites a crawler took and did not end: those of one that died. */
  running(runId: string): Promise<ResultRow[]>
  /** The pending site first in the crawl's order, now running, with one more attempt. */
  claim(runId: string, at: Date): Promise<ResultRow | null>
  attach(runId: string, domain: string, scanId: string): Promise<void>
  done(runId: string, domain: string, outcome: Outcome, at: Date): Promise<void>
  skip(runId: string, domain: string, reason: string, at: Date): Promise<void>
  fail(runId: string, domain: string, reason: string, at: Date): Promise<void>
  /** Back to pending for another try, the attempt spent (a failure that may not repeat). */
  retry(runId: string, domain: string, reason: string): Promise<void>
  /** Back to pending, the attempt given back: nothing was tried (the scanner was not there). */
  release(runId: string, domain: string): Promise<void>
  counts(runId: string): Promise<Readonly<Record<ResultState, number>>>
  results(runId: string): Promise<ResultRow[]>
  finish(runId: string, state: 'finished' | 'aborted', at: Date): Promise<void>
  /** One crawl at a time: false when another process holds the lock. */
  lock(): Promise<boolean>
  unlock(): Promise<void>
}

const STATES: readonly ResultState[] = ['pending', 'running', 'done', 'skipped', 'failed']
export const emptyCounts = (): Record<ResultState, number> =>
  Object.fromEntries(STATES.map((state) => [state, 0])) as Record<ResultState, number>

/** The store in memory: for the tests, and for a dry run. */
export class MemorySotawStore implements SotawStore {
  readonly #runs = new Map<string, RunRow>()
  readonly #rows = new Map<string, ResultRow>()
  #locked = false

  #key = (runId: string, domain: string) => `${runId}\u0000${domain}`

  #change(runId: string, domain: string, change: Partial<ResultRow>): void {
    const row = this.#rows.get(this.#key(runId, domain))
    if (row === undefined) throw new Error(`No site ${domain} in run ${runId}`)
    this.#rows.set(this.#key(runId, domain), { ...row, ...change })
  }

  start(run: NewRun, sites: readonly NewResult[], at: Date): Promise<RunRow> {
    const kept = this.#runs.get(run.id)
    if (kept !== undefined && kept.frameSha !== run.frameSha) {
      return Promise.reject(new Error(`Run ${run.id} was made from another frame`))
    }
    const row: RunRow = kept ?? {
      ...run,
      state: 'running',
      total: sites.length,
      createdAt: at,
      finishedAt: null,
    }
    this.#runs.set(run.id, row)
    for (const site of sites) {
      if (this.#rows.has(this.#key(run.id, site.domain))) continue
      this.#rows.set(this.#key(run.id, site.domain), {
        runId: run.id,
        ...site,
        state: 'pending',
        reason: null,
        attempts: 0,
        scanId: null,
        outcome: null,
      })
    }
    return Promise.resolve(row)
  }

  run(id: string): Promise<RunRow | null> {
    return Promise.resolve(this.#runs.get(id) ?? null)
  }

  #of(runId: string, state: ResultState): ResultRow[] {
    return [...this.#rows.values()]
      .filter((row) => row.runId === runId && row.state === state)
      .sort((a, b) => a.position - b.position)
  }

  running(runId: string): Promise<ResultRow[]> {
    return Promise.resolve(this.#of(runId, 'running'))
  }

  claim(runId: string): Promise<ResultRow | null> {
    const next = this.#of(runId, 'pending')[0]
    if (next === undefined) return Promise.resolve(null)
    this.#change(runId, next.domain, { state: 'running', attempts: next.attempts + 1 })
    return Promise.resolve({ ...next, state: 'running', attempts: next.attempts + 1 })
  }

  attach(runId: string, domain: string, scanId: string): Promise<void> {
    this.#change(runId, domain, { scanId })
    return Promise.resolve()
  }

  done(runId: string, domain: string, outcome: Outcome): Promise<void> {
    this.#change(runId, domain, { state: 'done', outcome, scanId: null, reason: null })
    return Promise.resolve()
  }

  skip(runId: string, domain: string, reason: string): Promise<void> {
    this.#change(runId, domain, { state: 'skipped', reason, scanId: null })
    return Promise.resolve()
  }

  fail(runId: string, domain: string, reason: string): Promise<void> {
    this.#change(runId, domain, { state: 'failed', reason, scanId: null })
    return Promise.resolve()
  }

  retry(runId: string, domain: string, reason: string): Promise<void> {
    this.#change(runId, domain, { state: 'pending', reason, scanId: null })
    return Promise.resolve()
  }

  release(runId: string, domain: string): Promise<void> {
    const row = this.#rows.get(this.#key(runId, domain))
    this.#change(runId, domain, {
      state: 'pending',
      scanId: null,
      attempts: Math.max(0, (row?.attempts ?? 1) - 1),
    })
    return Promise.resolve()
  }

  counts(runId: string): Promise<Readonly<Record<ResultState, number>>> {
    const counts = emptyCounts()
    for (const row of this.#rows.values()) if (row.runId === runId) counts[row.state]++
    return Promise.resolve(counts)
  }

  results(runId: string): Promise<ResultRow[]> {
    return Promise.resolve(
      [...this.#rows.values()]
        .filter((row) => row.runId === runId)
        .sort((a, b) => a.position - b.position),
    )
  }

  finish(runId: string, state: 'finished' | 'aborted', at: Date): Promise<void> {
    const run = this.#runs.get(runId)
    if (run !== undefined) this.#runs.set(runId, { ...run, state, finishedAt: at })
    return Promise.resolve()
  }

  lock(): Promise<boolean> {
    if (this.#locked) return Promise.resolve(false)
    this.#locked = true
    return Promise.resolve(true)
  }

  unlock(): Promise<void> {
    this.#locked = false
    return Promise.resolve()
  }
}
