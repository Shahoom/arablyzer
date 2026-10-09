import type { ScanState } from '@arablyzer/api-contract'
import type { Pool } from 'pg'
import type { AccountData, AddedSite, HistoryEntry, SavedSite, ScanSource } from '../accounts'

interface SiteRow {
  id: string
  url: string
  created_at: Date
}

interface HistoryRow {
  id: string
  url: string
  state: ScanState
  score: number | null
  created_at: Date
  site_id: string | null
}

const site = (row: SiteRow): SavedSite => ({
  id: row.id,
  url: row.url,
  createdAt: row.created_at,
})

const entry = (row: HistoryRow): HistoryEntry => ({
  scanId: row.id,
  url: row.url,
  state: row.state,
  score: row.score,
  createdAt: row.created_at,
  siteId: row.site_id,
})

const HISTORY = `SELECT s.id, s.url, s.state, s.score, s.created_at, a.site_id
  FROM account_scans a JOIN scans s ON s.id = a.scan_id`

/** What an account keeps, in PostgreSQL (M4.2). */
export class PostgresAccountData implements AccountData {
  readonly #pool: Pool

  constructor(pool: Pool) {
    this.#pool = pool
  }

  async sites(userId: string): Promise<SavedSite[]> {
    const { rows } = await this.#pool.query<SiteRow>(
      'SELECT id, url, created_at FROM sites WHERE user_id = $1 ORDER BY created_at, id',
      [userId],
    )
    return rows.map(site)
  }

  async site(userId: string, siteId: string): Promise<SavedSite | null> {
    const { rows } = await this.#pool.query<SiteRow>(
      'SELECT id, url, created_at FROM sites WHERE user_id = $1 AND id = $2',
      [userId, siteId],
    )
    return rows[0] === undefined ? null : site(rows[0])
  }

  async addSite(
    userId: string,
    added: { id: string; url: string; createdAt: Date },
    limit: number,
  ): Promise<AddedSite> {
    const client = await this.#pool.connect()
    try {
      await client.query('BEGIN')
      // One person's adds are taken one at a time, so the count below is the count the insert
      // makes true: two requests at once cannot both pass the limit.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `sites:${userId}`,
      ])
      const existing = await client.query<SiteRow>(
        'SELECT id, url, created_at FROM sites WHERE user_id = $1 AND url = $2',
        [userId, added.url],
      )
      if (existing.rows[0] !== undefined) {
        await client.query('COMMIT')
        return { kind: 'existing', site: site(existing.rows[0]) }
      }
      const count = await client.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM sites WHERE user_id = $1',
        [userId],
      )
      if ((count.rows[0]?.n ?? 0) >= limit) {
        await client.query('COMMIT')
        return { kind: 'limit' }
      }
      await client.query(
        'INSERT INTO sites (id, user_id, url, created_at) VALUES ($1, $2, $3, $4)',
        [added.id, userId, added.url, added.createdAt],
      )
      await client.query('COMMIT')
      return { kind: 'added', site: added }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async removeSite(userId: string, siteId: string): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      'DELETE FROM sites WHERE user_id = $1 AND id = $2',
      [userId, siteId],
    )
    return (rowCount ?? 0) > 0
  }

  async link(link: {
    userId: string
    scanId: string
    url: string
    source: ScanSource
    createdAt: Date
  }): Promise<void> {
    await this.#pool.query(
      `INSERT INTO account_scans (scan_id, user_id, site_id, source, created_at)
       VALUES ($1, $2, (SELECT id FROM sites WHERE user_id = $2 AND url = $4), $3, $5)`,
      [link.scanId, link.userId, link.source, link.url, link.createdAt],
    )
  }

  async history(userId: string, limit: number): Promise<HistoryEntry[]> {
    const { rows } = await this.#pool.query<HistoryRow>(
      `${HISTORY} WHERE a.user_id = $1 ORDER BY a.created_at DESC, s.id LIMIT $2`,
      [userId, limit],
    )
    return rows.map(entry)
  }

  async latestPerSite(userId: string): Promise<ReadonlyMap<string, HistoryEntry>> {
    const { rows } = await this.#pool.query<HistoryRow>(
      `SELECT DISTINCT ON (a.site_id) s.id, s.url, s.state, s.score, s.created_at, a.site_id
       FROM account_scans a JOIN scans s ON s.id = a.scan_id
       WHERE a.user_id = $1 AND a.site_id IS NOT NULL
       ORDER BY a.site_id, a.created_at DESC, s.id`,
      [userId],
    )
    return new Map(rows.map((row) => [row.site_id ?? '', entry(row)]))
  }

  async eraseUser(userId: string): Promise<void> {
    await this.#pool.query(
      'DELETE FROM scans WHERE id IN (SELECT scan_id FROM account_scans WHERE user_id = $1)',
      [userId],
    )
  }
}
