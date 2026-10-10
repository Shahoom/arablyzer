import type { ScanState } from '@arablyzer/api-contract'
import type { Pool } from 'pg'
import type {
  AccountData,
  AddedSite,
  HistoryEntry,
  SavedSite,
  ScanSource,
  ScorePoint,
} from '../accounts'

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

interface PointRow {
  id: string
  state: ScanState
  created_at: Date
  source: ScanSource
  score: number | null
  categories: Record<string, number | null> | null
  criticals: string[] | null
}

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

  async ownerOf(scanId: string): Promise<string | null> {
    const { rows } = await this.#pool.query<{ user_id: string }>(
      'SELECT user_id FROM account_scans WHERE scan_id = $1',
      [scanId],
    )
    return rows[0]?.user_id ?? null
  }

  async linkedScans(
    userId: string,
    scanIds: readonly string[],
  ): Promise<ReadonlyMap<string, { readonly siteId: string | null; readonly source: ScanSource }>> {
    if (scanIds.length === 0) return new Map()
    const { rows } = await this.#pool.query<{
      scan_id: string
      site_id: string | null
      source: ScanSource
    }>(
      'SELECT scan_id, site_id, source FROM account_scans WHERE user_id = $1 AND scan_id = ANY($2::text[])',
      [userId, [...scanIds]],
    )
    return new Map(rows.map((row) => [row.scan_id, { siteId: row.site_id, source: row.source }]))
  }

  async scorePoints(
    userId: string,
    siteId: string,
    since: Date,
    limit: number,
  ): Promise<ScorePoint[]> {
    // The category scores and the critical fingerprints are read out of the report in the
    // database, so no report travels to the API for a chart.
    const { rows } = await this.#pool.query<PointRow>(
      `SELECT * FROM (
         SELECT s.id, s.state, s.created_at, a.source, s.score,
                s.report #> '{score,categories}' AS categories,
                jsonb_path_query_array(s.report, '$.findings[*] ? (@.severity == "critical").fingerprint') AS criticals
         FROM account_scans a JOIN scans s ON s.id = a.scan_id
         WHERE a.user_id = $1 AND a.site_id = $2 AND a.source <> 'crawl'
           AND s.tool IS NULL AND a.created_at >= $3
         ORDER BY a.created_at DESC, s.id LIMIT $4
       ) recent ORDER BY created_at, id`,
      [userId, siteId, since, limit],
    )
    return rows.map((row) => ({
      scanId: row.id,
      createdAt: row.created_at,
      source: row.source,
      state: row.state,
      score: row.score,
      categories: row.categories ?? {},
      criticals: row.criticals ?? [],
    }))
  }

  async eraseUser(userId: string): Promise<void> {
    await this.#pool.query(
      'DELETE FROM scans WHERE id IN (SELECT scan_id FROM account_scans WHERE user_id = $1)',
      [userId],
    )
  }
}
