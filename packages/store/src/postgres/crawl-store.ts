import type { CrawlError, CrawlState, Localized } from '@arablyzer/api-contract'
import type { Pool } from 'pg'
import {
  pickNext,
  type Crawl,
  type CrawlData,
  type CrawlPageRow,
  type CrawlPatch,
  type Found,
  type NewCrawl,
  type PageIssue,
  type PageRecord,
  type PageState,
  type Started,
  type StoredTemplate,
} from '../crawls'

interface CrawlRow {
  id: string
  user_id: string
  site_id: string | null
  start_url: string
  origin: string
  state: CrawlState
  error: CrawlError | null
  page_cap: number
  delay_ms: number
  pages_found: number
  pages_checked: number
  cancel_requested: boolean
  lease_until: Date | null
  created_at: Date
  started_at: Date | null
  render_started_at: Date | null
  finished_at: Date | null
  templates: StoredTemplate[]
  titles: Record<string, Localized>
}

const CRAWL = `id, user_id, site_id, start_url, origin, state, error, page_cap, delay_ms,
  pages_found, pages_checked, cancel_requested, lease_until, created_at, started_at,
  render_started_at, finished_at, templates, titles`

const crawl = (row: CrawlRow): Crawl => ({
  id: row.id,
  userId: row.user_id,
  siteId: row.site_id,
  startUrl: row.start_url,
  origin: row.origin,
  state: row.state,
  error: row.error,
  pageCap: row.page_cap,
  delayMs: row.delay_ms,
  pagesFound: row.pages_found,
  pagesChecked: row.pages_checked,
  cancelRequested: row.cancel_requested,
  leaseUntil: row.lease_until,
  createdAt: row.created_at,
  startedAt: row.started_at,
  renderStartedAt: row.render_started_at,
  finishedAt: row.finished_at,
  templates: row.templates,
  titles: row.titles,
})

interface PageRowSql {
  url: string
  depth: number
  bucket: string
  state: PageState
  status: number | null
  template: string | null
  title: string | null
  skeleton: string | null
  issues: PageIssue[]
  render_issues: PageIssue[]
  scan_id: string | null
  error: string | null
}

const PAGE =
  'url, depth, bucket, state, status, template, title, skeleton, issues, render_issues, scan_id, error'

const page = (row: PageRowSql): CrawlPageRow => ({
  url: row.url,
  depth: row.depth,
  bucket: row.bucket,
  state: row.state,
  status: row.status,
  template: row.template,
  title: row.title,
  skeleton: row.skeleton,
  issues: row.issues,
  renderIssues: row.render_issues,
  scanId: row.scan_id,
  error: row.error,
})

const ACTIVE = "('queued', 'running', 'rendering')"
/** Postgres' code for a unique index that a statement would break. */
const UNIQUE_VIOLATION = '23505'

/** What a deep crawl keeps, in PostgreSQL (M4.5). */
export class PostgresCrawlData implements CrawlData {
  readonly #pool: Pool

  constructor(pool: Pool) {
    this.#pool = pool
  }

  async create(input: NewCrawl): Promise<Started> {
    try {
      const { rows } = await this.#pool.query<CrawlRow>(
        `INSERT INTO crawls (id, user_id, site_id, start_url, origin, state, page_cap, delay_ms, created_at)
         VALUES ($1, $2, $3, $4, $5, 'queued', $6, $7, $8) RETURNING ${CRAWL}`,
        [
          input.id,
          input.userId,
          input.siteId,
          input.startUrl,
          new URL(input.startUrl).origin,
          input.pageCap,
          input.delayMs,
          input.createdAt,
        ],
      )
      const row = rows[0]
      if (row === undefined) throw new Error('The insert returned no row')
      return { kind: 'created', crawl: crawl(row) }
    } catch (error) {
      // The unique index on the account's active crawls is what says one is running already.
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) return { kind: 'active' }
      throw error
    }
  }

  async get(id: string): Promise<Crawl | null> {
    const { rows } = await this.#pool.query<CrawlRow>(`SELECT ${CRAWL} FROM crawls WHERE id = $1`, [
      id,
    ])
    return rows[0] === undefined ? null : crawl(rows[0])
  }

  async forSite(userId: string, siteId: string, limit: number): Promise<Crawl[]> {
    const { rows } = await this.#pool.query<CrawlRow>(
      `SELECT ${CRAWL} FROM crawls WHERE user_id = $1 AND site_id = $2
       ORDER BY created_at DESC, id LIMIT $3`,
      [userId, siteId, limit],
    )
    return rows.map(crawl)
  }

  async latestPerSite(userId: string): Promise<ReadonlyMap<string, Crawl>> {
    const { rows } = await this.#pool.query<CrawlRow>(
      `SELECT DISTINCT ON (site_id) ${CRAWL} FROM crawls
       WHERE user_id = $1 AND site_id IS NOT NULL ORDER BY site_id, created_at DESC, id`,
      [userId],
    )
    return new Map(rows.map((row) => [row.site_id ?? '', crawl(row)]))
  }

  async requestCancel(userId: string, id: string, at: Date): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      `UPDATE crawls SET cancel_requested = true,
         state = CASE WHEN state = 'queued' THEN 'cancelled' ELSE state END,
         finished_at = CASE WHEN state = 'queued' THEN $3 ELSE finished_at END
       WHERE id = $1 AND user_id = $2 AND state IN ${ACTIVE}`,
      [id, userId, at],
    )
    return (rowCount ?? 0) > 0
  }

  async remove(userId: string, id: string): Promise<'removed' | 'active' | 'missing'> {
    const { rows } = await this.#pool.query<{ state: CrawlState }>(
      'SELECT state FROM crawls WHERE id = $1 AND user_id = $2',
      [id, userId],
    )
    const found = rows[0]
    if (found === undefined) return 'missing'
    if (['queued', 'running', 'rendering'].includes(found.state)) return 'active'
    await this.#pool.query(
      `DELETE FROM crawls WHERE id = $1 AND user_id = $2 AND state NOT IN ${ACTIVE}`,
      [id, userId],
    )
    return 'removed'
  }

  async claim(now: Date, leaseUntil: Date): Promise<Crawl | null> {
    const { rows } = await this.#pool.query<CrawlRow>(
      // The conditions are in the outer statement too: a claim that waited for another's commit
      // re-reads the row under them, and finds the lease taken.
      `UPDATE crawls SET lease_until = $2
       WHERE state IN ${ACTIVE} AND (lease_until IS NULL OR lease_until <= $1) AND id = (
         SELECT id FROM crawls
         WHERE state IN ${ACTIVE} AND (lease_until IS NULL OR lease_until <= $1)
         ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
       ) RETURNING ${CRAWL}`,
      [now, leaseUntil],
    )
    return rows[0] === undefined ? null : crawl(rows[0])
  }

  async update(id: string, patch: CrawlPatch): Promise<void> {
    const sets: string[] = []
    const values: unknown[] = [id]
    const set = (column: string, value: unknown, cast = '') => {
      values.push(value)
      sets.push(`${column} = $${String(values.length)}${cast}`)
    }
    if (patch.origin !== undefined) set('origin', patch.origin)
    if (patch.state !== undefined) set('state', patch.state)
    if (patch.error !== undefined) set('error', patch.error)
    if (patch.leaseUntil !== undefined) set('lease_until', patch.leaseUntil)
    if (patch.startedAt !== undefined) set('started_at', patch.startedAt)
    if (patch.renderStartedAt !== undefined) set('render_started_at', patch.renderStartedAt)
    if (patch.finishedAt !== undefined) set('finished_at', patch.finishedAt)
    if (patch.templates !== undefined) set('templates', JSON.stringify(patch.templates), '::jsonb')
    if (patch.titles !== undefined) set('titles', JSON.stringify(patch.titles), '::jsonb')
    if (sets.length === 0) return
    // The titles are merged, not replaced: a rule seen on one page is still known on the next.
    const sql = sets.map((entry) =>
      entry.startsWith('titles = ') ? entry.replace('titles = ', 'titles = titles || ') : entry,
    )
    await this.#pool.query(`UPDATE crawls SET ${sql.join(', ')} WHERE id = $1`, values)
  }

  async add(id: string, found: readonly Found[], rowCap: number): Promise<number> {
    if (found.length === 0) return 0
    const client = await this.#pool.connect()
    try {
      await client.query('BEGIN')
      // The crawl's row is the lock: two writers of one crawl take turns, so the cap is kept.
      await client.query('SELECT 1 FROM crawls WHERE id = $1 FOR UPDATE', [id])
      const count = await client.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM crawl_pages WHERE crawl_id = $1',
        [id],
      )
      const room = Math.max(0, rowCap - (count.rows[0]?.n ?? 0))
      const added = await this.#insert(
        client,
        id,
        found.slice(0, Math.min(found.length, room * 2)),
        room,
      )
      await this.#count(client, id)
      await client.query('COMMIT')
      return added
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async #insert(
    client: { query: Pool['query'] },
    id: string,
    found: readonly Found[],
    room: number,
  ): Promise<number> {
    if (found.length === 0 || room <= 0) return 0
    const { rowCount } = await client.query(
      `INSERT INTO crawl_pages (crawl_id, url, depth, bucket, state)
       SELECT $1, u.url, u.depth, u.bucket, 'found'
       FROM unnest($2::text[], $3::int[], $4::text[]) WITH ORDINALITY AS u(url, depth, bucket, n)
       ORDER BY u.n LIMIT $5
       ON CONFLICT (crawl_id, url) DO NOTHING`,
      [id, found.map((f) => f.url), found.map((f) => f.depth), found.map((f) => f.bucket), room],
    )
    return rowCount ?? 0
  }

  async #count(client: { query: Pool['query'] }, id: string): Promise<void> {
    await client.query(
      `UPDATE crawls SET
         pages_found = (SELECT count(*) FROM crawl_pages WHERE crawl_id = $1),
         pages_checked = (SELECT count(*) FROM crawl_pages WHERE crawl_id = $1 AND state IN ('checked', 'failed'))
       WHERE id = $1`,
      [id],
    )
  }

  async next(id: string): Promise<Found | null> {
    const [candidates, asked] = await Promise.all([
      this.#pool.query<{ url: string; depth: number; bucket: string; seq: string }>(
        `SELECT DISTINCT ON (bucket) url, depth, bucket, seq::text AS seq FROM crawl_pages
         WHERE crawl_id = $1 AND state = 'found' ORDER BY bucket, depth, seq`,
        [id],
      ),
      this.#pool.query<{ bucket: string; n: number }>(
        `SELECT bucket, count(*)::int AS n FROM crawl_pages
         WHERE crawl_id = $1 AND state IN ('checked', 'failed') GROUP BY bucket`,
        [id],
      ),
    ])
    return pickNext(
      candidates.rows.map((row) => ({ ...row, seq: Number(row.seq) })),
      new Map(asked.rows.map((row) => [row.bucket, row.n])),
    )
  }

  async record(id: string, url: string, result: PageRecord, rowCap: number): Promise<void> {
    const client = await this.#pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT 1 FROM crawls WHERE id = $1 FOR UPDATE', [id])
      await client.query(
        `UPDATE crawl_pages SET state = $3, status = $4, title = $5, skeleton = $6,
           issues = $7::jsonb, error = $8
         WHERE crawl_id = $1 AND url = $2`,
        [
          id,
          url,
          result.state,
          result.status,
          result.title,
          result.skeleton,
          JSON.stringify(result.issues),
          result.error,
        ],
      )
      const count = await client.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM crawl_pages WHERE crawl_id = $1',
        [id],
      )
      const room = Math.max(0, rowCap - (count.rows[0]?.n ?? 0))
      await this.#insert(client, id, result.links.slice(0, room * 2), room)
      await this.#count(client, id)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async pages(id: string): Promise<CrawlPageRow[]> {
    const { rows } = await this.#pool.query<PageRowSql>(
      `SELECT ${PAGE} FROM crawl_pages WHERE crawl_id = $1 ORDER BY seq`,
      [id],
    )
    return rows.map(page)
  }

  async assign(
    id: string,
    templates: readonly StoredTemplate[],
    assignments: ReadonlyMap<string, string>,
  ): Promise<void> {
    const client = await this.#pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('UPDATE crawls SET templates = $2::jsonb WHERE id = $1', [
        id,
        JSON.stringify(templates),
      ])
      await client.query(
        `UPDATE crawl_pages p SET template = a.key
         FROM unnest($2::text[], $3::text[]) AS a(url, key)
         WHERE p.crawl_id = $1 AND p.url = a.url`,
        [id, [...assignments.keys()], [...assignments.values()]],
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async setScan(id: string, url: string, scanId: string): Promise<void> {
    await this.#pool.query('UPDATE crawl_pages SET scan_id = $3 WHERE crawl_id = $1 AND url = $2', [
      id,
      url,
      scanId,
    ])
  }

  async setRenderIssues(id: string, url: string, issues: readonly PageIssue[]): Promise<void> {
    await this.#pool.query(
      'UPDATE crawl_pages SET render_issues = $3::jsonb WHERE crawl_id = $1 AND url = $2',
      [id, url, JSON.stringify(issues)],
    )
  }

  async list(
    id: string,
    options: { template?: string; offset: number; limit: number },
  ): Promise<CrawlPageRow[]> {
    const { rows } = await this.#pool.query<PageRowSql>(
      `SELECT ${PAGE} FROM crawl_pages
       WHERE crawl_id = $1 AND ($2::text IS NULL OR template = $2)
       ORDER BY seq OFFSET $3 LIMIT $4`,
      [id, options.template ?? null, options.offset, options.limit],
    )
    return rows.map(page)
  }

  async prune(before: Date): Promise<number> {
    const { rowCount } = await this.#pool.query(
      `DELETE FROM crawls WHERE state NOT IN ${ACTIVE} AND COALESCE(finished_at, created_at) < $1`,
      [before],
    )
    return rowCount ?? 0
  }

  async eraseUser(userId: string): Promise<void> {
    // The rows go by cascade with the user; this is the explicit step the memory version needs.
    await this.#pool.query('DELETE FROM crawls WHERE user_id = $1', [userId])
  }
}
