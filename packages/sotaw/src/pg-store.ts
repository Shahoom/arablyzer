import type pg from 'pg'
import { Outcome } from './outcome'
import {
  emptyCounts,
  type NewResult,
  type NewRun,
  type ResultRow,
  type ResultState,
  type RunRow,
  type RunState,
  type SotawStore,
} from './store'

/** The advisory lock that keeps a second crawl out: a number nobody else in the database takes. */
const LOCK_KEY = 90_090_001
const CHUNK = 2_000

interface ResultRecord {
  run_id: string
  domain: string
  country: string
  rank: number
  position: number
  state: ResultState
  reason: string | null
  attempts: number
  scan_id: string | null
  outcome: unknown
}

function rowOf(record: ResultRecord): ResultRow {
  // The outcome is checked where it is read: a row some other version wrote is no outcome.
  const outcome = record.outcome === null ? null : Outcome.safeParse(record.outcome)
  return {
    runId: record.run_id,
    domain: record.domain,
    country: record.country,
    rank: record.rank,
    position: record.position,
    state: record.state,
    reason: record.reason,
    attempts: record.attempts,
    scanId: record.scan_id,
    outcome: outcome?.success === true ? outcome.data : null,
  }
}

/** `sotaw_runs` and `sotaw_results` (packages/store, drizzle 0009), through the application role. */
export class PostgresSotawStore implements SotawStore {
  readonly #pool: pg.Pool
  #lock: pg.PoolClient | null = null

  constructor(pool: pg.Pool) {
    this.#pool = pool
  }

  async start(run: NewRun, sites: readonly NewResult[], at: Date): Promise<RunRow> {
    await this.#pool.query(
      `INSERT INTO sotaw_runs (id, frame_id, frame_sha, seed, state, total, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'running', $5, $6, $6) ON CONFLICT (id) DO NOTHING`,
      [run.id, run.frameId, run.frameSha, run.seed, sites.length, at],
    )
    const kept = await this.run(run.id)
    if (kept?.frameSha !== run.frameSha) {
      throw new Error(`Run ${run.id} was made from another frame`)
    }
    for (let i = 0; i < sites.length; i += CHUNK) {
      const part = sites.slice(i, i + CHUNK)
      await this.#pool.query(
        `INSERT INTO sotaw_results (run_id, domain, country, rank, position, state)
         SELECT $1, d, c, r, p, 'pending'
         FROM unnest($2::text[], $3::text[], $4::int[], $5::int[]) AS t(d, c, r, p)
         ON CONFLICT (run_id, domain) DO NOTHING`,
        [
          run.id,
          part.map((s) => s.domain),
          part.map((s) => s.country),
          part.map((s) => s.rank),
          part.map((s) => s.position),
        ],
      )
    }
    await this.#pool.query(
      `UPDATE sotaw_runs SET state = 'running', updated_at = $2, finished_at = NULL WHERE id = $1`,
      [run.id, at],
    )
    return kept
  }

  async run(id: string): Promise<RunRow | null> {
    const { rows } = await this.#pool.query<{
      id: string
      frame_id: string
      frame_sha: string
      seed: string
      state: RunState
      total: number
      created_at: Date
      finished_at: Date | null
    }>(`SELECT * FROM sotaw_runs WHERE id = $1`, [id])
    const row = rows[0]
    return row === undefined
      ? null
      : {
          id: row.id,
          frameId: row.frame_id,
          frameSha: row.frame_sha,
          seed: row.seed,
          state: row.state,
          total: row.total,
          createdAt: row.created_at,
          finishedAt: row.finished_at,
        }
  }

  async running(runId: string): Promise<ResultRow[]> {
    const { rows } = await this.#pool.query<ResultRecord>(
      `SELECT * FROM sotaw_results WHERE run_id = $1 AND state = 'running' ORDER BY position`,
      [runId],
    )
    return rows.map(rowOf)
  }

  async claim(runId: string, at: Date): Promise<ResultRow | null> {
    const { rows } = await this.#pool.query<ResultRecord>(
      `UPDATE sotaw_results SET state = 'running', attempts = attempts + 1, started_at = $2
       WHERE (run_id, domain) IN (
         SELECT run_id, domain FROM sotaw_results
         WHERE run_id = $1 AND state = 'pending' ORDER BY position LIMIT 1 FOR UPDATE SKIP LOCKED)
       RETURNING *`,
      [runId, at],
    )
    const row = rows[0]
    return row === undefined ? null : rowOf(row)
  }

  async attach(runId: string, domain: string, scanId: string): Promise<void> {
    await this.#pool.query(
      `UPDATE sotaw_results SET scan_id = $3 WHERE run_id = $1 AND domain = $2`,
      [runId, domain, scanId],
    )
  }

  async done(runId: string, domain: string, outcome: Outcome, at: Date): Promise<void> {
    await this.#pool.query(
      `UPDATE sotaw_results SET state = 'done', outcome = $3, scan_id = NULL, reason = NULL, finished_at = $4
       WHERE run_id = $1 AND domain = $2`,
      [runId, domain, JSON.stringify(outcome), at],
    )
  }

  async skip(runId: string, domain: string, reason: string, at: Date): Promise<void> {
    await this.#pool.query(
      `UPDATE sotaw_results SET state = 'skipped', reason = $3, scan_id = NULL, finished_at = $4
       WHERE run_id = $1 AND domain = $2`,
      [runId, domain, reason, at],
    )
  }

  async fail(runId: string, domain: string, reason: string, at: Date): Promise<void> {
    await this.#pool.query(
      `UPDATE sotaw_results SET state = 'failed', reason = $3, scan_id = NULL, finished_at = $4
       WHERE run_id = $1 AND domain = $2`,
      [runId, domain, reason, at],
    )
  }

  async retry(runId: string, domain: string, reason: string): Promise<void> {
    await this.#pool.query(
      `UPDATE sotaw_results SET state = 'pending', reason = $3, scan_id = NULL WHERE run_id = $1 AND domain = $2`,
      [runId, domain, reason],
    )
  }

  async release(runId: string, domain: string): Promise<void> {
    await this.#pool.query(
      `UPDATE sotaw_results SET state = 'pending', scan_id = NULL, attempts = GREATEST(attempts - 1, 0)
       WHERE run_id = $1 AND domain = $2`,
      [runId, domain],
    )
  }

  async counts(runId: string): Promise<Readonly<Record<ResultState, number>>> {
    const { rows } = await this.#pool.query<{ state: ResultState; n: string }>(
      `SELECT state, count(*) AS n FROM sotaw_results WHERE run_id = $1 GROUP BY state`,
      [runId],
    )
    const counts = emptyCounts()
    for (const row of rows) counts[row.state] = Number(row.n)
    return counts
  }

  async results(runId: string): Promise<ResultRow[]> {
    const { rows } = await this.#pool.query<ResultRecord>(
      `SELECT * FROM sotaw_results WHERE run_id = $1 ORDER BY position`,
      [runId],
    )
    return rows.map(rowOf)
  }

  async finish(runId: string, state: 'finished' | 'aborted', at: Date): Promise<void> {
    await this.#pool.query(
      `UPDATE sotaw_runs SET state = $2, updated_at = $3, finished_at = $3 WHERE id = $1`,
      [runId, state, at],
    )
  }

  async lock(): Promise<boolean> {
    if (this.#lock !== null) return false
    const client = await this.#pool.connect()
    const { rows } = await client.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock($1) AS locked`,
      [LOCK_KEY],
    )
    if (rows[0]?.locked === true) {
      this.#lock = client
      return true
    }
    client.release()
    return false
  }

  async unlock(): Promise<void> {
    const client = this.#lock
    if (client === null) return
    this.#lock = null
    try {
      await client.query(`SELECT pg_advisory_unlock($1)`, [LOCK_KEY])
    } finally {
      client.release()
    }
  }
}
