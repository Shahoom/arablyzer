import type { ScanState, WebhookKind } from '@arablyzer/api-contract'
import type { Pool } from 'pg'
import {
  applyAlerts,
  defaultAlerts,
  type AlertsPatch,
  type DueMonitor,
  type Enabled,
  type Monitor,
  type MonitorData,
  type PendingRun,
  type RunPoint,
  type StoredAlerts,
} from '../monitors'

interface MonitorRow {
  site_id: string
  user_id: string
  every_days: number
  paused: boolean
  next_run_at: Date
  failures: number
  created_at: Date
}

const monitor = (row: MonitorRow): Monitor => ({
  siteId: row.site_id,
  userId: row.user_id,
  everyDays: row.every_days,
  paused: row.paused,
  nextRunAt: row.next_run_at,
  failures: row.failures,
  createdAt: row.created_at,
})

function requireRow<T>(row: T | undefined): T {
  if (row === undefined) throw new Error('The statement returned no row')
  return row
}

const MONITOR = 'site_id, user_id, every_days, paused, next_run_at, failures, created_at'

interface AlertRow {
  user_id: string
  webhook_url: string | null
  webhook_secret: string | null
  webhook_kind: WebhookKind | null
  webhook_failures: number
  webhook_disabled_at: Date | null
  drop_threshold: number
  on_critical: boolean
  on_down: boolean
  weekly_summary: boolean
  email: boolean
  last_summary_at: Date | null
}

const alerts = (row: AlertRow): StoredAlerts => ({
  userId: row.user_id,
  webhook:
    row.webhook_url === null || row.webhook_secret === null || row.webhook_kind === null
      ? null
      : {
          url: row.webhook_url,
          secret: row.webhook_secret,
          kind: row.webhook_kind,
          failures: row.webhook_failures,
          disabledAt: row.webhook_disabled_at,
        },
  dropThreshold: row.drop_threshold,
  onCritical: row.on_critical,
  onDown: row.on_down,
  weeklySummary: row.weekly_summary,
  email: row.email,
  lastSummaryAt: row.last_summary_at,
})

/** What monitoring keeps, in PostgreSQL (M4.3). */
export class PostgresMonitorData implements MonitorData {
  readonly #pool: Pool

  constructor(pool: Pool) {
    this.#pool = pool
  }

  async monitor(userId: string, siteId: string): Promise<Monitor | null> {
    const { rows } = await this.#pool.query<MonitorRow>(
      `SELECT ${MONITOR} FROM monitors WHERE user_id = $1 AND site_id = $2`,
      [userId, siteId],
    )
    return rows[0] === undefined ? null : monitor(rows[0])
  }

  async monitors(userId: string): Promise<Monitor[]> {
    const { rows } = await this.#pool.query<MonitorRow>(
      `SELECT ${MONITOR} FROM monitors WHERE user_id = $1 ORDER BY created_at, site_id`,
      [userId],
    )
    return rows.map(monitor)
  }

  async enable(
    userId: string,
    siteId: string,
    input: { everyDays: number; nextRunAt: Date; createdAt: Date },
    limit: number,
  ): Promise<Enabled> {
    const client = await this.#pool.connect()
    try {
      await client.query('BEGIN')
      // One person's changes are taken one at a time, so the count is the count the write makes true.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `monitors:${userId}`,
      ])
      const existing = await client.query<MonitorRow>(
        `SELECT ${MONITOR} FROM monitors WHERE user_id = $1 AND site_id = $2`,
        [userId, siteId],
      )
      const found = existing.rows[0]
      if (found !== undefined && !found.paused) {
        await client.query('COMMIT')
        return { kind: 'existing', monitor: monitor(found) }
      }
      const count = await client.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM monitors WHERE user_id = $1 AND NOT paused',
        [userId],
      )
      if ((count.rows[0]?.n ?? 0) >= limit) {
        await client.query('COMMIT')
        return { kind: 'limit' }
      }
      const written = await client.query<MonitorRow>(
        `INSERT INTO monitors (site_id, user_id, every_days, paused, next_run_at, failures, created_at)
         VALUES ($1, $2, $3, false, $4, 0, $5)
         ON CONFLICT (site_id) DO UPDATE
           SET paused = false, failures = 0, every_days = $3, next_run_at = $4
         RETURNING ${MONITOR}`,
        [siteId, userId, input.everyDays, input.nextRunAt, input.createdAt],
      )
      await client.query('COMMIT')
      return { kind: 'enabled', monitor: monitor(requireRow(written.rows[0])) }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async disable(userId: string, siteId: string): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      'DELETE FROM monitors WHERE user_id = $1 AND site_id = $2',
      [userId, siteId],
    )
    return (rowCount ?? 0) > 0
  }

  async claimDue(now: Date, max: number, leaseUntil: Date): Promise<DueMonitor[]> {
    // The rows are locked and moved in one statement: a second scheduler skips them, and a crash
    // leaves the lease, which ends by itself.
    const { rows } = await this.#pool.query<MonitorRow & { url: string; scheduled_for: Date }>(
      `WITH due AS (
         SELECT site_id, next_run_at FROM monitors
         WHERE NOT paused AND next_run_at <= $1
         ORDER BY next_run_at, site_id LIMIT $2 FOR UPDATE SKIP LOCKED)
       UPDATE monitors m SET next_run_at = $3
       FROM due d JOIN sites s ON s.id = d.site_id
       WHERE m.site_id = d.site_id
       RETURNING m.site_id, m.user_id, m.every_days, m.paused, m.next_run_at, m.failures, m.created_at,
                 s.url, d.next_run_at AS scheduled_for`,
      [now, max, leaseUntil],
    )
    return rows
      .map((row) => ({ monitor: monitor(row), url: row.url, scheduledFor: row.scheduled_for }))
      .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())
  }

  async pauseExtras(userId: string, keep: number): Promise<number> {
    const { rowCount } = await this.#pool.query(
      `UPDATE monitors SET paused = true WHERE site_id IN (
         SELECT site_id FROM monitors WHERE user_id = $1 AND NOT paused
         ORDER BY created_at, site_id OFFSET $2)`,
      [userId, keep],
    )
    return rowCount ?? 0
  }

  async recordRun(run: Parameters<MonitorData['recordRun']>[0]): Promise<void> {
    const client = await this.#pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO account_scans (scan_id, user_id, site_id, source, created_at)
         VALUES ($1, $2, $3, 'monitor', $4)`,
        [run.scanId, run.userId, run.siteId, run.at],
      )
      await client.query(
        'INSERT INTO monitor_runs (scan_id, site_id, scheduled_for) VALUES ($1, $2, $3)',
        [run.scanId, run.siteId, run.scheduledFor],
      )
      await client.query(
        'UPDATE monitors SET next_run_at = $2, every_days = $3 WHERE site_id = $1',
        [run.siteId, run.nextRunAt, run.everyDays],
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async defer(siteId: string, until: Date): Promise<void> {
    await this.#pool.query('UPDATE monitors SET next_run_at = $2 WHERE site_id = $1', [
      siteId,
      until,
    ])
  }

  async setHealth(siteId: string, health: { failures: number; paused: boolean }): Promise<void> {
    await this.#pool.query('UPDATE monitors SET failures = $2, paused = $3 WHERE site_id = $1', [
      siteId,
      health.failures,
      health.paused,
    ])
  }

  async trend(userId: string, length: number): Promise<ReadonlyMap<string, RunPoint[]>> {
    const { rows } = await this.#pool.query<{
      site_id: string
      scan_id: string
      state: ScanState
      score: number | null
      created_at: Date
    }>(
      `SELECT site_id, scan_id, state, score, created_at FROM (
         SELECT r.site_id, s.id AS scan_id, s.state, s.score, s.created_at, r.scheduled_for,
                row_number() OVER (PARTITION BY r.site_id ORDER BY r.scheduled_for DESC) AS n
         FROM monitor_runs r
         JOIN monitors m ON m.site_id = r.site_id
         JOIN scans s ON s.id = r.scan_id
         WHERE m.user_id = $1) t
       WHERE n <= $2 ORDER BY site_id, scheduled_for`,
      [userId, length],
    )
    const trend = new Map<string, RunPoint[]>()
    for (const row of rows) {
      const points = trend.get(row.site_id) ?? []
      points.push({ scanId: row.scan_id, state: row.state, score: row.score, at: row.created_at })
      trend.set(row.site_id, points)
    }
    return trend
  }

  async pending(now: Date, max: number): Promise<PendingRun[]> {
    const { rows } = await this.#pool.query<{
      scan_id: string
      site_id: string
      user_id: string
      url: string
      language: 'ar' | 'en' | null
      email: string
      scheduled_for: Date
      attempts: number
      state: ScanState
      created_at: Date
    }>(
      `SELECT r.scan_id, r.site_id, m.user_id, s.url, u.language, u.email, r.scheduled_for, r.attempts,
              s.state, s.created_at
       FROM monitor_runs r
       JOIN monitors m ON m.site_id = r.site_id
       JOIN scans s ON s.id = r.scan_id
       JOIN users u ON u.id = m.user_id
       WHERE r.notified_at IS NULL AND (r.retry_after IS NULL OR r.retry_after <= $1)
       ORDER BY r.scheduled_for, r.scan_id LIMIT $2`,
      [now, max],
    )
    return rows.map((row) => ({
      scanId: row.scan_id,
      siteId: row.site_id,
      userId: row.user_id,
      url: row.url,
      language: row.language,
      email: row.email,
      scheduledFor: row.scheduled_for,
      attempts: row.attempts,
      state: row.state,
      createdAt: row.created_at,
    }))
  }

  async previousScan(siteId: string, before: Date): Promise<string | null> {
    const { rows } = await this.#pool.query<{ id: string }>(
      `SELECT s.id FROM account_scans a JOIN scans s ON s.id = a.scan_id
       WHERE a.site_id = $1 AND s.created_at < $2 AND s.state IN ('complete', 'partial')
       ORDER BY s.created_at DESC, s.id LIMIT 1`,
      [siteId, before],
    )
    return rows[0]?.id ?? null
  }

  async settle(scanId: string, at: Date): Promise<void> {
    await this.#pool.query('UPDATE monitor_runs SET notified_at = $2 WHERE scan_id = $1', [
      scanId,
      at,
    ])
  }

  async retryLater(scanId: string, after: Date, attempts: number): Promise<void> {
    await this.#pool.query(
      'UPDATE monitor_runs SET retry_after = $2, attempts = $3 WHERE scan_id = $1',
      [scanId, after, attempts],
    )
  }

  async alerts(userId: string): Promise<StoredAlerts> {
    const { rows } = await this.#pool.query<AlertRow>(
      'SELECT * FROM alert_settings WHERE user_id = $1',
      [userId],
    )
    return rows[0] === undefined ? defaultAlerts(userId) : alerts(rows[0])
  }

  async saveAlerts(userId: string, patch: AlertsPatch): Promise<StoredAlerts> {
    const next = applyAlerts(await this.alerts(userId), patch)
    await this.#pool.query(
      `INSERT INTO alert_settings (user_id, webhook_url, webhook_secret, webhook_kind, webhook_failures,
         webhook_disabled_at, drop_threshold, on_critical, on_down, weekly_summary, email, last_summary_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (user_id) DO UPDATE SET
         webhook_url = $2, webhook_secret = $3, webhook_kind = $4, webhook_failures = $5,
         webhook_disabled_at = $6, drop_threshold = $7, on_critical = $8, on_down = $9,
         weekly_summary = $10, email = $11`,
      [
        userId,
        next.webhook?.url ?? null,
        next.webhook?.secret ?? null,
        next.webhook?.kind ?? null,
        next.webhook?.failures ?? 0,
        next.webhook?.disabledAt ?? null,
        next.dropThreshold,
        next.onCritical,
        next.onDown,
        next.weeklySummary,
        next.email,
        next.lastSummaryAt,
      ],
    )
    return next
  }

  async delivered(
    userId: string,
    ok: boolean,
    at: Date,
    maxFailures: number,
  ): Promise<StoredAlerts> {
    await this.#pool.query(
      `UPDATE alert_settings SET
         webhook_failures = CASE WHEN $2 THEN 0 ELSE webhook_failures + 1 END,
         webhook_disabled_at = CASE
           WHEN webhook_disabled_at IS NOT NULL THEN webhook_disabled_at
           WHEN NOT $2 AND webhook_failures + 1 >= $4 THEN $3
           ELSE NULL END
       WHERE user_id = $1 AND webhook_url IS NOT NULL`,
      [userId, ok, at, maxFailures],
    )
    return this.alerts(userId)
  }

  async reenable(userId: string): Promise<void> {
    await this.#pool.query(
      'UPDATE alert_settings SET webhook_failures = 0, webhook_disabled_at = NULL WHERE user_id = $1',
      [userId],
    )
  }

  async summarized(userId: string, at: Date): Promise<void> {
    // A person who never saved an alert setting has no row, and no summary to record.
    await this.#pool.query('UPDATE alert_settings SET last_summary_at = $2 WHERE user_id = $1', [
      userId,
      at,
    ])
  }

  async eraseUser(userId: string): Promise<void> {
    await this.#pool.query('DELETE FROM monitors WHERE user_id = $1', [userId])
    await this.#pool.query('DELETE FROM alert_settings WHERE user_id = $1', [userId])
  }
}
