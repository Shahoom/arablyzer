import type { Pool } from 'pg'
import {
  PENDING_MS,
  periodStarts,
  secondsUntilLeaves,
  type AiData,
  type FixUsage,
  type Reservation,
  type Reserved,
  type StoredFix,
} from '../ai'

const DAY_MS = 24 * 60 * 60_000

/** Reservations are taken one at a time, whoever asks: the caps are sums over every account. */
const SPEND_LOCK = 'ai:spend'

/** The cost of a row for the caps: settled, its cost; waiting, what was held for it. */
const COST = 'CASE WHEN cost_micro IS NULL THEN reserved_micro ELSE cost_micro END'
/** A row that counts at $n: settled, or waiting and not yet taken for dead. */
const counts = (n: number) => `(cost_micro IS NOT NULL OR created_at > $${String(n)})`

/** PostgreSQL's AiData. */
export class PostgresAiData implements AiData {
  readonly #pool: Pool

  constructor(pool: Pool) {
    this.#pool = pool
  }

  async cached(key: string, since: Date): Promise<StoredFix | null> {
    const { rows } = await this.#pool.query<{ fix: string; model: string; created_at: Date }>(
      'SELECT fix, model, created_at FROM ai_fix_cache WHERE key = $1 AND created_at >= $2',
      [key, since],
    )
    const row = rows[0]
    return row === undefined ? null : { fix: row.fix, model: row.model, createdAt: row.created_at }
  }

  async cache(key: string, fix: string, model: string, at: Date): Promise<void> {
    await this.#pool.query(
      `INSERT INTO ai_fix_cache (key, fix, model, created_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE SET fix = $2, model = $3, created_at = $4`,
      [key, fix, model, at],
    )
  }

  async reserve(input: Reservation): Promise<Reserved> {
    const { at } = input
    const forgotten = new Date(at.getTime() - PENDING_MS)
    const windowStart = new Date(at.getTime() - DAY_MS)
    const starts = periodStarts(at)
    const client = await this.#pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [SPEND_LOCK])
      const mine = await client.query<{ created_at: Date; waiting: boolean }>(
        `SELECT created_at, cost_micro IS NULL AS waiting FROM ai_requests
         WHERE user_id = $1 AND created_at > $2 AND ${counts(3)}
         ORDER BY created_at, id`,
        [input.userId, windowStart, forgotten],
      )
      const waiting = mine.rows.filter((row) => row.waiting).length
      if (waiting >= input.maxPending) {
        await client.query('COMMIT')
        return { kind: 'busy' }
      }
      if (mine.rows.length >= input.perDay) {
        await client.query('COMMIT')
        const leaving = mine.rows[mine.rows.length - input.perDay]
        return {
          kind: 'limit',
          retryAfterSeconds: secondsUntilLeaves(leaving?.created_at ?? at, at),
        }
      }
      const spent = await client.query<{ day: string; month: string }>(
        `SELECT COALESCE(SUM(${COST}) FILTER (WHERE created_at >= $1), 0) AS day,
                COALESCE(SUM(${COST}), 0) AS month
         FROM ai_requests WHERE created_at >= $2 AND ${counts(3)}`,
        [starts.day, starts.month, forgotten],
      )
      const total = spent.rows[0]
      const day = Number(total?.day ?? 0)
      const month = Number(total?.month ?? 0)
      if (input.dailyCapMicro !== null && day + input.worstMicro > input.dailyCapMicro) {
        await client.query('COMMIT')
        return { kind: 'budget', cap: 'day' }
      }
      if (input.monthlyCapMicro !== null && month + input.worstMicro > input.monthlyCapMicro) {
        await client.query('COMMIT')
        return { kind: 'budget', cap: 'month' }
      }
      await client.query(
        `INSERT INTO ai_requests (id, user_id, rule_id, created_at, reserved_micro)
         VALUES ($1, $2, $3, $4, $5)`,
        [input.id, input.userId, input.ruleId, at, input.worstMicro],
      )
      await client.query('COMMIT')
      return { kind: 'reserved' }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async settle(id: string, usage: FixUsage, at: Date): Promise<void> {
    await this.#pool.query(
      `UPDATE ai_requests SET cost_micro = $2, model = $3, input_tokens = $4, output_tokens = $5,
         cache_read_tokens = $6, cache_write_tokens = $7, settled_at = $8
       WHERE id = $1`,
      [
        id,
        Math.ceil(usage.costMicro),
        usage.model,
        usage.inputTokens,
        usage.outputTokens,
        usage.cacheReadTokens,
        usage.cacheWriteTokens,
        at,
      ],
    )
  }

  async release(id: string): Promise<void> {
    await this.#pool.query('DELETE FROM ai_requests WHERE id = $1 AND cost_micro IS NULL', [id])
  }

  async used(userId: string, at: Date): Promise<number> {
    const { rows } = await this.#pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ai_requests
       WHERE user_id = $1 AND created_at > $2 AND ${counts(3)}`,
      [userId, new Date(at.getTime() - DAY_MS), new Date(at.getTime() - PENDING_MS)],
    )
    return rows[0]?.n ?? 0
  }

  async spent(at: Date): Promise<{ day: number; month: number }> {
    const starts = periodStarts(at)
    const { rows } = await this.#pool.query<{ day: string; month: string }>(
      `SELECT COALESCE(SUM(${COST}) FILTER (WHERE created_at >= $1), 0) AS day,
              COALESCE(SUM(${COST}), 0) AS month
       FROM ai_requests WHERE created_at >= $2 AND ${counts(3)}`,
      [starts.day, starts.month, new Date(at.getTime() - PENDING_MS)],
    )
    return { day: Number(rows[0]?.day ?? 0), month: Number(rows[0]?.month ?? 0) }
  }

  async eraseUser(userId: string): Promise<void> {
    await this.#pool.query('UPDATE ai_requests SET user_id = NULL WHERE user_id = $1', [userId])
  }

  async prune(before: Date): Promise<number> {
    const requests = await this.#pool.query(
      'DELETE FROM ai_requests WHERE created_at < $1 AND cost_micro IS NOT NULL',
      [before],
    )
    const answers = await this.#pool.query('DELETE FROM ai_fix_cache WHERE created_at < $1', [
      before,
    ])
    return (requests.rowCount ?? 0) + (answers.rowCount ?? 0)
  }
}
