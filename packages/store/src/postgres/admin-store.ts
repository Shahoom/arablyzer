import type { ScanState } from '@arablyzer/api-contract'
import { sanitizeOverrides, type PlanOverrides } from '@arablyzer/plans'
import type { Pool } from 'pg'
import {
  erasedRef,
  NO_STATE,
  OVERVIEW_DAYS,
  type AdminData,
  type AdminScanRow,
  type AdminUserRow,
  type AuditDetail,
  type AuditEntry,
  type NewAuditEntry,
  type Overview,
  type Page,
  type UserState,
} from '../admin'

/** The host a stored URL names: the scans table keeps the URL, so the host is read out of it. */
const HOST = `lower(substring(s.url from '^[a-zA-Z][a-zA-Z0-9+.-]*://(?:[^/@?#]*@)?(\\[[^\\]]+\\]|[^/:?#]+)'))`

/** `%` and `_` in what a person typed mean themselves in a search. */
const like = (text: string): string => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

interface UserRowSql {
  id: string
  email: string
  name: string
  language: string | null
  created_at: Date
  last_sign_in_at: Date | null
  suspended_at: Date | null
  overrides: unknown
  sessions: number
  sites: number
  monitors: number
  api_keys: number
  scans: number
}

const USER_SELECT = `
SELECT u.id, u.email, u.name, u.language, u.created_at,
       st.last_sign_in_at, st.suspended_at, st.overrides,
       (SELECT count(*)::int FROM sessions x WHERE x.user_id = u.id AND x.expires_at > now()) AS sessions,
       (SELECT count(*)::int FROM sites x WHERE x.user_id = u.id) AS sites,
       (SELECT count(*)::int FROM monitors x WHERE x.user_id = u.id) AS monitors,
       (SELECT count(*)::int FROM api_keys x WHERE x.user_id = u.id) AS api_keys,
       (SELECT count(*)::int FROM account_scans x WHERE x.user_id = u.id) AS scans
FROM users u LEFT JOIN admin_user_state st ON st.user_id = u.id`

const userRow = (row: UserRowSql): AdminUserRow => ({
  id: row.id,
  email: row.email,
  name: row.name,
  language: row.language,
  createdAt: row.created_at,
  // A person who signed in before the panel existed has no noted sign-in: the sessions are all there is.
  lastSignInAt: row.last_sign_in_at,
  suspendedAt: row.suspended_at,
  hasOverrides: Object.keys(sanitizeOverrides(row.overrides)).length > 0,
  sessions: row.sessions,
  sites: row.sites,
  monitors: row.monitors,
  apiKeys: row.api_keys,
  scans: row.scans,
})

interface AuditRowSql {
  id: string
  at: Date
  actor_id: string
  actor_email: string | null
  action: string
  target_id: string | null
  target_email: string | null
  detail: unknown
  network: string | null
}

const auditEntry = (row: AuditRowSql): AuditEntry => ({
  id: row.id,
  at: row.at,
  actorId: row.actor_id,
  actorEmail: row.actor_email,
  action: row.action,
  targetId: row.target_id,
  targetEmail: row.target_email,
  detail: typeof row.detail === 'object' && row.detail !== null ? (row.detail as AuditDetail) : {},
  network: row.network,
})

const SCAN_STATES: readonly ScanState[] = ['queued', 'running', 'complete', 'partial', 'failed']

/** The owner's panel on PostgreSQL (M4.8): the API's role only. */
export class PostgresAdminData implements AdminData {
  readonly #pool: Pool

  constructor(pool: Pool) {
    this.#pool = pool
  }

  async state(userId: string): Promise<UserState> {
    const found = await this.#pool.query<{
      suspended_at: Date | null
      last_sign_in_at: Date | null
      overrides: unknown
    }>('SELECT suspended_at, last_sign_in_at, overrides FROM admin_user_state WHERE user_id = $1', [
      userId,
    ])
    const row = found.rows[0]
    if (row === undefined) return NO_STATE
    return {
      suspendedAt: row.suspended_at,
      lastSignInAt: row.last_sign_in_at,
      overrides: sanitizeOverrides(row.overrides),
    }
  }

  async setSuspended(userId: string, at: Date | null, now: Date): Promise<void> {
    await this.#pool.query(
      `INSERT INTO admin_user_state (user_id, suspended_at, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET suspended_at = $2, updated_at = $3`,
      [userId, at, now],
    )
  }

  async setOverrides(userId: string, overrides: PlanOverrides, now: Date): Promise<void> {
    const clean = sanitizeOverrides(overrides)
    await this.#pool.query(
      `INSERT INTO admin_user_state (user_id, overrides, updated_at) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (user_id) DO UPDATE SET overrides = $2::jsonb, updated_at = $3`,
      [userId, Object.keys(clean).length === 0 ? null : JSON.stringify(clean), now],
    )
  }

  async noteSignIn(userId: string, at: Date): Promise<void> {
    await this.#pool.query(
      `INSERT INTO admin_user_state (user_id, last_sign_in_at, updated_at) VALUES ($1, $2, $2)
       ON CONFLICT (user_id) DO UPDATE SET last_sign_in_at = $2`,
      [userId, at],
    )
  }

  async audit(entry: NewAuditEntry): Promise<void> {
    await this.#pool.query(
      `INSERT INTO admin_audit (id, at, actor_id, actor_email, action, target_id, target_email, detail, network)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
      [
        entry.id,
        entry.at,
        entry.actorId,
        entry.actorEmail,
        entry.action,
        entry.targetId,
        entry.targetEmail,
        JSON.stringify(entry.detail),
        entry.network,
      ],
    )
  }

  async auditLog(options: {
    targetId?: string
    limit: number
    offset: number
  }): Promise<Page<AuditEntry>> {
    const where = options.targetId === undefined ? '' : 'WHERE target_id = $1'
    const params = options.targetId === undefined ? [] : [options.targetId]
    const total = await this.#pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM admin_audit ${where}`,
      params,
    )
    const rows = await this.#pool.query<AuditRowSql>(
      `SELECT * FROM admin_audit ${where} ORDER BY at DESC, id DESC
       LIMIT $${String(params.length + 1)} OFFSET $${String(params.length + 2)}`,
      [...params, options.limit, options.offset],
    )
    return { rows: rows.rows.map(auditEntry), total: total.rows[0]?.n ?? 0 }
  }

  async sweepAudit(before: Date): Promise<number> {
    const gone = await this.#pool.query('DELETE FROM admin_audit WHERE at < $1', [before])
    return gone.rowCount ?? 0
  }

  async eraseUser(userId: string): Promise<void> {
    const ref = erasedRef(userId)
    const client = await this.#pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('DELETE FROM admin_user_state WHERE user_id = $1', [userId])
      await client.query(
        'UPDATE admin_audit SET target_id = $2, target_email = NULL WHERE target_id = $1',
        [userId, ref],
      )
      await client.query(
        'UPDATE admin_audit SET actor_id = $2, actor_email = NULL WHERE actor_id = $1',
        [userId, ref],
      )
      await client.query('COMMIT')
    } catch (thrown) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw thrown
    } finally {
      client.release()
    }
  }

  async users(options: { q?: string; limit: number; offset: number }): Promise<Page<AdminUserRow>> {
    const q = options.q?.trim() ?? ''
    const where = q === '' ? '' : `WHERE u.email ILIKE $1 OR u.name ILIKE $1`
    const params = q === '' ? [] : [like(q)]
    const total = await this.#pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM users u ${where}`,
      params,
    )
    const rows = await this.#pool.query<UserRowSql>(
      `${USER_SELECT} ${where} ORDER BY u.created_at DESC, u.id
       LIMIT $${String(params.length + 1)} OFFSET $${String(params.length + 2)}`,
      [...params, options.limit, options.offset],
    )
    return { rows: rows.rows.map(userRow), total: total.rows[0]?.n ?? 0 }
  }

  async user(userId: string): Promise<AdminUserRow | null> {
    const found = await this.#pool.query<UserRowSql>(`${USER_SELECT} WHERE u.id = $1`, [userId])
    const row = found.rows[0]
    return row === undefined ? null : userRow(row)
  }

  async overview(now: Date): Promise<Overview> {
    const week = new Date(now.getTime() - 7 * 86_400_000)
    const day = new Date(now.getTime() - 86_400_000)
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    )
    const first = new Date(startOfToday.getTime() - (OVERVIEW_DAYS - 1) * 86_400_000)
    const q = <T extends object>(text: string, params: unknown[]) =>
      this.#pool.query<T>(text, params)
    const [accounts, scans, scanDays, userDays, other] = await Promise.all([
      q<{ total: number; new_week: number; active_week: number; suspended: number }>(
        `SELECT (SELECT count(*)::int FROM users) AS total,
                (SELECT count(*)::int FROM users WHERE created_at >= $1) AS new_week,
                (SELECT count(DISTINCT user_id)::int FROM sessions WHERE updated_at >= $1) AS active_week,
                (SELECT count(*)::int FROM admin_user_state WHERE suspended_at IS NOT NULL) AS suspended`,
        [week],
      ),
      q<Record<string, number | Date | null>>(
        `SELECT count(*) FILTER (WHERE s.created_at >= $1 AND a.scan_id IS NULL)::int AS today_anon,
                count(*) FILTER (WHERE s.created_at >= $1 AND a.scan_id IS NOT NULL)::int AS today_account,
                count(*) FILTER (WHERE s.created_at >= $2 AND a.scan_id IS NULL)::int AS week_anon,
                count(*) FILTER (WHERE s.created_at >= $2 AND a.scan_id IS NOT NULL)::int AS week_account,
                count(*) FILTER (WHERE s.state = 'failed' AND s.created_at >= $3)::int AS failed,
                count(*) FILTER (WHERE s.state = 'running')::int AS running,
                count(*) FILTER (WHERE s.state = 'queued')::int AS queued,
                min(s.created_at) FILTER (WHERE s.state = 'queued') AS oldest_queued,
                max(s.finished_at) AS last_finished
         FROM scans s LEFT JOIN account_scans a ON a.scan_id = s.id`,
        [startOfToday, week, day],
      ),
      q<{ d: string; account: boolean; n: number }>(
        `SELECT to_char(s.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d,
                (a.scan_id IS NOT NULL) AS account, count(*)::int AS n
         FROM scans s LEFT JOIN account_scans a ON a.scan_id = s.id
         WHERE s.created_at >= $1 GROUP BY 1, 2`,
        [first],
      ),
      q<{ d: string; n: number }>(
        `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d, count(*)::int AS n
         FROM users WHERE created_at >= $1 GROUP BY 1`,
        [first],
      ),
      q<{ monitors: number; crawls: number; pdfs: number }>(
        `SELECT (SELECT count(*)::int FROM monitors WHERE NOT paused) AS monitors,
                (SELECT count(*)::int FROM crawls WHERE state IN ('queued', 'running', 'rendering')) AS crawls,
                (SELECT COALESCE(sum(count), 0)::int FROM pdf_usage WHERE month = $1) AS pdfs`,
        [now.toISOString().slice(0, 7)],
      ),
    ])
    const a = accounts.rows[0]
    const s = scans.rows[0]
    const o = other.rows[0]
    const num = (value: unknown): number => (typeof value === 'number' ? value : 0)
    const date = (value: unknown): Date | null => (value instanceof Date ? value : null)
    const days = Array.from({ length: OVERVIEW_DAYS }, (_, i) =>
      new Date(first.getTime() + i * 86_400_000).toISOString().slice(0, 10),
    )
    const series = (rows: { d: string; n: number; account?: boolean }[], account?: boolean) =>
      days.map((d) =>
        rows
          .filter((row) => row.d === d && (account === undefined || row.account === account))
          .reduce((sum, row) => sum + row.n, 0),
      )
    return {
      accounts: {
        total: a?.total ?? 0,
        newThisWeek: a?.new_week ?? 0,
        activeThisWeek: a?.active_week ?? 0,
        suspended: a?.suspended ?? 0,
      },
      scans: {
        today: { anonymous: num(s?.today_anon), account: num(s?.today_account) },
        week: { anonymous: num(s?.week_anon), account: num(s?.week_account) },
        failed24h: num(s?.failed),
        running: num(s?.running),
        queued: num(s?.queued),
        oldestQueuedAt: date(s?.oldest_queued),
        lastFinishedAt: date(s?.last_finished),
      },
      monitorsActive: o?.monitors ?? 0,
      crawlsRunning: o?.crawls ?? 0,
      pdfsThisMonth: o?.pdfs ?? 0,
      daily: {
        days,
        scansAnonymous: series(scanDays.rows, false),
        scansAccount: series(scanDays.rows, true),
        newAccounts: series(userDays.rows),
      },
    }
  }

  async scans(options: {
    state?: ScanState
    host?: string
    limit: number
    offset: number
  }): Promise<Page<AdminScanRow>> {
    const conditions: string[] = []
    const params: unknown[] = []
    if (options.state !== undefined && SCAN_STATES.includes(options.state)) {
      params.push(options.state)
      conditions.push(`s.state = $${String(params.length)}`)
    }
    const host = options.host?.trim() ?? ''
    if (host !== '') {
      params.push(like(host.toLowerCase()))
      conditions.push(`${HOST} LIKE $${String(params.length)}`)
    }
    const where = conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`
    const total = await this.#pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM scans s ${where}`,
      params,
    )
    const rows = await this.#pool.query<{
      id: string
      url: string
      host: string | null
      tool: string | null
      state: ScanState
      created_at: Date
      score: number | null
      user_id: string | null
      email: string | null
    }>(
      `SELECT s.id, s.url, ${HOST} AS host, s.tool, s.state, s.created_at, s.score, a.user_id, u.email
       FROM scans s LEFT JOIN account_scans a ON a.scan_id = s.id LEFT JOIN users u ON u.id = a.user_id
       ${where} ORDER BY s.created_at DESC, s.id
       LIMIT $${String(params.length + 1)} OFFSET $${String(params.length + 2)}`,
      [...params, options.limit, options.offset],
    )
    return {
      total: total.rows[0]?.n ?? 0,
      rows: rows.rows.map((row) => ({
        id: row.id,
        url: row.url,
        host: row.host ?? '',
        tool: row.tool,
        state: row.state,
        createdAt: row.created_at,
        score: row.score,
        userId: row.user_id,
        userEmail: row.email,
      })),
    }
  }

  async topHosts(since: Date, limit: number): Promise<{ host: string; count: number }[]> {
    const rows = await this.#pool.query<{ host: string | null; n: number }>(
      `SELECT ${HOST} AS host, count(*)::int AS n FROM scans s WHERE s.created_at >= $1
       GROUP BY 1 ORDER BY n DESC, host LIMIT $2`,
      [since, limit],
    )
    return rows.rows.map((row) => ({ host: row.host ?? '', count: row.n }))
  }

  async deleteScan(scanId: string): Promise<boolean> {
    const gone = await this.#pool.query('DELETE FROM scans WHERE id = $1', [scanId])
    return (gone.rowCount ?? 0) > 0
  }
}
