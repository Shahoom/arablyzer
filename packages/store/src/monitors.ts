import type { ScanState, WebhookKind } from '@arablyzer/api-contract'
import type { AccountData } from './accounts'
import type { MemoryScanStore } from './memory'

// What monitoring keeps (M4.3): which saved sites are watched and when each is next scanned, the
// runs (one per scan the scheduler made, which go with the scan), and where a person's alerts go.
// Like the account's other data it holds nothing about a visitor, and goes with the account.

export interface Monitor {
  readonly siteId: string
  readonly userId: string
  readonly everyDays: number
  /** Stopped by the plan (a downgrade) or by repeated failures; enabling it again resumes it. */
  readonly paused: boolean
  /** When the next run is due. While a run is being started it is the lease's end. */
  readonly nextRunAt: Date
  /** Runs in a row that found the site unreachable or could not scan it. */
  readonly failures: number
  readonly createdAt: Date
}

/** A monitor whose run is due, claimed for one scheduler: nobody else is given it until the lease ends. */
export interface DueMonitor {
  readonly monitor: Monitor
  readonly url: string
  /** The slot this run is for: the date the monitor was due. */
  readonly scheduledFor: Date
}

export type Enabled =
  | { readonly kind: 'enabled' | 'existing'; readonly monitor: Monitor }
  /** The account monitors as many sites as its plan allows. */
  | { readonly kind: 'limit' }

/** One run of a monitor as the trend shows it. */
export interface RunPoint {
  readonly scanId: string
  readonly state: ScanState
  readonly score: number | null
  readonly at: Date
}

/** A run whose alerts are not decided yet (or are being retried). */
export interface PendingRun {
  readonly scanId: string
  readonly siteId: string
  readonly userId: string
  readonly url: string
  /** The language of the person's account, for the alert's words. */
  readonly language: 'ar' | 'en' | null
  readonly scheduledFor: Date
  /** Deliveries tried so far. */
  readonly attempts: number
  readonly state: ScanState
  readonly createdAt: Date
}

export interface StoredWebhook {
  readonly url: string
  readonly secret: string
  readonly kind: WebhookKind
  /** Deliveries in a row that failed. */
  readonly failures: number
  readonly disabledAt: Date | null
}

export interface StoredAlerts {
  readonly userId: string
  readonly webhook: StoredWebhook | null
  readonly dropThreshold: number
  readonly onCritical: boolean
  readonly onDown: boolean
  readonly weeklySummary: boolean
  readonly email: boolean
  readonly lastSummaryAt: Date | null
}

/** A change to a person's alerts: what is absent stays as it is. A null webhook removes it. */
export interface AlertsPatch {
  readonly webhook?: {
    readonly url: string
    readonly secret: string
    readonly kind: WebhookKind
  } | null
  readonly dropThreshold?: number
  readonly onCritical?: boolean
  readonly onDown?: boolean
  readonly weeklySummary?: boolean
  readonly email?: boolean
}

/** Values of alerts nobody has changed. */
export function defaultAlerts(userId: string, dropThreshold = 10): StoredAlerts {
  return {
    userId,
    webhook: null,
    dropThreshold,
    onCritical: true,
    onDown: true,
    weeklySummary: false,
    email: false,
    lastSummaryAt: null,
  }
}

export function applyAlerts(current: StoredAlerts, patch: AlertsPatch): StoredAlerts {
  return {
    userId: current.userId,
    webhook:
      patch.webhook === undefined
        ? current.webhook
        : patch.webhook === null
          ? null
          : { ...patch.webhook, failures: 0, disabledAt: null },
    dropThreshold: patch.dropThreshold ?? current.dropThreshold,
    onCritical: patch.onCritical ?? current.onCritical,
    onDown: patch.onDown ?? current.onDown,
    weeklySummary: patch.weeklySummary ?? current.weeklySummary,
    email: patch.email ?? current.email,
    lastSummaryAt: current.lastSummaryAt,
  }
}

export interface MonitorData {
  monitor(userId: string, siteId: string): Promise<Monitor | null>
  monitors(userId: string): Promise<Monitor[]>
  /**
   * Starts monitoring a saved site, unless the person already monitors `limit` sites that are not
   * paused: counted and stored as one step, so two requests at once cannot pass the limit. A site
   * monitored already is `existing`; a paused one is resumed if the limit allows.
   */
  enable(
    userId: string,
    siteId: string,
    input: { readonly everyDays: number; readonly nextRunAt: Date; readonly createdAt: Date },
    limit: number,
  ): Promise<Enabled>
  /** False when the site was not monitored. Its scans stay in the history. */
  disable(userId: string, siteId: string): Promise<boolean>
  /**
   * The monitors due at `now` that are not paused, at most `max`, oldest first, each leased until
   * `leaseUntil`: it is that monitor's next date until a run is recorded or the run is deferred, so a
   * second scheduler, or this one after a restart, is not given it again.
   */
  claimDue(now: Date, max: number, leaseUntil: Date): Promise<DueMonitor[]>
  /** Pauses the person's monitors past the first `keep` that are not paused (oldest kept). Returns how many. */
  pauseExtras(userId: string, keep: number): Promise<number>
  /**
   * Stores the run the scheduler just made: the scan becomes the account's (source `monitor`), the
   * run is recorded for its slot, and the monitor's next date and interval are set, all together.
   */
  recordRun(run: {
    readonly userId: string
    readonly siteId: string
    readonly scanId: string
    readonly url: string
    readonly scheduledFor: Date
    readonly at: Date
    readonly everyDays: number
    readonly nextRunAt: Date
  }): Promise<void>
  /** Moves the monitor's next date without a run: the scheduler could not start it now. */
  defer(siteId: string, until: Date): Promise<void>
  /** Sets the failure count and whether it is paused. */
  setHealth(
    siteId: string,
    health: { readonly failures: number; readonly paused: boolean },
  ): Promise<void>
  /** The last `length` runs of each of the person's monitored sites, oldest first, by site. */
  trend(userId: string, length: number): Promise<ReadonlyMap<string, RunPoint[]>>
  /** Runs not yet decided whose retry date has come, oldest first, at most `max`. */
  pending(now: Date, max: number): Promise<PendingRun[]>
  /** The newest scan of the site that ended with a report, created before `before`; its id. */
  previousScan(siteId: string, before: Date): Promise<string | null>
  /** The run's alerts are decided: delivered, or given up. */
  settle(scanId: string, at: Date): Promise<void>
  /** A delivery failed: try again after `after`, `attempts` made so far. */
  retryLater(scanId: string, after: Date, attempts: number): Promise<void>
  alerts(userId: string): Promise<StoredAlerts>
  saveAlerts(userId: string, patch: AlertsPatch): Promise<StoredAlerts>
  /**
   * A delivery's result. Failures in a row count; at `maxFailures` the webhook is disabled. A success
   * resets the count and leaves a disabled webhook disabled (a test turns it on: `reenable`).
   */
  delivered(userId: string, ok: boolean, at: Date, maxFailures: number): Promise<StoredAlerts>
  reenable(userId: string): Promise<void>
  summarized(userId: string, at: Date): Promise<void>
  /** Deletes everything monitoring keeps for the person (before the account itself goes). */
  eraseUser(userId: string): Promise<void>
}

interface MemoryRun {
  readonly scanId: string
  readonly siteId: string
  readonly scheduledFor: Date
  notified: boolean
  attempts: number
  retryAfter: Date | null
}

/** MonitorData in memory, over the memory scan store and account data, for tests and `pnpm dev`. */
export class MemoryMonitorData implements MonitorData {
  readonly #accounts: AccountData
  readonly #scans: MemoryScanStore
  readonly #monitors = new Map<string, Monitor>()
  readonly #runs: MemoryRun[] = []
  readonly #alerts = new Map<string, StoredAlerts>()
  /** The language of each account, as the users table holds it; tests set it. */
  readonly languages = new Map<string, 'ar' | 'en'>()

  constructor(accounts: AccountData, scans: MemoryScanStore) {
    this.#accounts = accounts
    this.#scans = scans
  }

  monitor(userId: string, siteId: string): Promise<Monitor | null> {
    const found = this.#monitors.get(siteId)
    return Promise.resolve(found?.userId === userId ? found : null)
  }

  monitors(userId: string): Promise<Monitor[]> {
    return Promise.resolve(
      [...this.#monitors.values()]
        .filter((monitor) => monitor.userId === userId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    )
  }

  enable(
    userId: string,
    siteId: string,
    input: { everyDays: number; nextRunAt: Date; createdAt: Date },
    limit: number,
  ): Promise<Enabled> {
    // No await between the count and the write: one step, as the PostgreSQL version's lock makes it.
    const existing = this.#monitors.get(siteId)
    const mine = existing?.userId === userId ? existing : undefined
    if (mine !== undefined && !mine.paused)
      return Promise.resolve({ kind: 'existing', monitor: mine })
    const active = [...this.#monitors.values()].filter((m) => m.userId === userId && !m.paused)
    if (active.length >= limit) return Promise.resolve({ kind: 'limit' })
    const monitor: Monitor = {
      siteId,
      userId,
      everyDays: input.everyDays,
      paused: false,
      nextRunAt: input.nextRunAt,
      failures: 0,
      createdAt: mine?.createdAt ?? input.createdAt,
    }
    this.#monitors.set(siteId, monitor)
    return Promise.resolve({ kind: 'enabled', monitor })
  }
  disable(userId: string, siteId: string): Promise<boolean> {
    if (this.#monitors.get(siteId)?.userId !== userId) return Promise.resolve(false)
    this.#monitors.delete(siteId)
    for (let index = this.#runs.length - 1; index >= 0; index--) {
      if (this.#runs[index]?.siteId === siteId) this.#runs.splice(index, 1)
    }
    return Promise.resolve(true)
  }

  async claimDue(now: Date, max: number, leaseUntil: Date): Promise<DueMonitor[]> {
    // Leased before any await, so a second claimer is not given the same monitors.
    const due = [...this.#monitors.values()]
      .filter((monitor) => !monitor.paused && monitor.nextRunAt <= now)
      .sort((a, b) => a.nextRunAt.getTime() - b.nextRunAt.getTime())
      .slice(0, max)
    const leased = due.map((monitor) => ({ ...monitor, nextRunAt: leaseUntil }))
    for (const monitor of leased) this.#monitors.set(monitor.siteId, monitor)
    const claimed: DueMonitor[] = []
    for (const [index, monitor] of leased.entries()) {
      const site = await this.#accounts.site(monitor.userId, monitor.siteId)
      if (site === null) this.#monitors.delete(monitor.siteId)
      else claimed.push({ monitor, url: site.url, scheduledFor: due[index]?.nextRunAt ?? now })
    }
    return claimed
  }

  async pauseExtras(userId: string, keep: number): Promise<number> {
    const active = (await this.monitors(userId)).filter((monitor) => !monitor.paused)
    let paused = 0
    for (const monitor of active.slice(keep)) {
      this.#monitors.set(monitor.siteId, { ...monitor, paused: true })
      paused++
    }
    return paused
  }

  async recordRun(run: Parameters<MonitorData['recordRun']>[0]): Promise<void> {
    const monitor = this.#monitors.get(run.siteId)
    if (monitor === undefined) throw new Error('No such monitor')
    if (
      this.#runs.some(
        (kept) => kept.siteId === run.siteId && +kept.scheduledFor === +run.scheduledFor,
      )
    ) {
      throw new Error('This slot has a run already')
    }
    await this.#accounts.link({
      userId: run.userId,
      scanId: run.scanId,
      url: run.url,
      source: 'monitor',
      createdAt: run.at,
    })
    this.#runs.push({
      scanId: run.scanId,
      siteId: run.siteId,
      scheduledFor: run.scheduledFor,
      notified: false,
      attempts: 0,
      retryAfter: null,
    })
    this.#monitors.set(run.siteId, {
      ...monitor,
      everyDays: run.everyDays,
      nextRunAt: run.nextRunAt,
    })
  }

  defer(siteId: string, until: Date): Promise<void> {
    const monitor = this.#monitors.get(siteId)
    if (monitor !== undefined) this.#monitors.set(siteId, { ...monitor, nextRunAt: until })
    return Promise.resolve()
  }

  setHealth(siteId: string, health: { failures: number; paused: boolean }): Promise<void> {
    const monitor = this.#monitors.get(siteId)
    if (monitor !== undefined) this.#monitors.set(siteId, { ...monitor, ...health })
    return Promise.resolve()
  }

  async trend(userId: string, length: number): Promise<ReadonlyMap<string, RunPoint[]>> {
    const trend = new Map<string, RunPoint[]>()
    const mine = new Set((await this.monitors(userId)).map((monitor) => monitor.siteId))
    const runs = this.#runs
      .filter((run) => mine.has(run.siteId))
      .sort((a, b) => b.scheduledFor.getTime() - a.scheduledFor.getTime())
    for (const run of runs) {
      const scan = await this.#scans.get(run.scanId)
      if (scan === null) continue
      const points = trend.get(run.siteId) ?? []
      if (points.length >= length) continue
      points.unshift({
        scanId: scan.id,
        state: scan.state,
        score: scan.report?.score.overall ?? null,
        at: scan.createdAt,
      })
      trend.set(run.siteId, points)
    }
    return trend
  }

  async pending(now: Date, max: number): Promise<PendingRun[]> {
    const pending: PendingRun[] = []
    const runs = [...this.#runs].sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())
    for (const run of runs) {
      if (pending.length >= max) break
      if (run.notified || (run.retryAfter !== null && run.retryAfter > now)) continue
      const monitor = this.#monitors.get(run.siteId)
      const scan = await this.#scans.get(run.scanId)
      if (monitor === undefined || scan === null) continue
      pending.push({
        scanId: run.scanId,
        siteId: run.siteId,
        userId: monitor.userId,
        url: scan.url,
        language: this.languages.get(monitor.userId) ?? null,
        scheduledFor: run.scheduledFor,
        attempts: run.attempts,
        state: scan.state,
        createdAt: scan.createdAt,
      })
    }
    return pending
  }

  async previousScan(siteId: string, before: Date): Promise<string | null> {
    const monitor = this.#monitors.get(siteId)
    if (monitor === undefined) return null
    const history = await this.#accounts.history(monitor.userId, Number.MAX_SAFE_INTEGER)
    const found = history.find(
      (entry) =>
        entry.siteId === siteId &&
        entry.createdAt < before &&
        (entry.state === 'complete' || entry.state === 'partial'),
    )
    return found?.scanId ?? null
  }

  settle(scanId: string): Promise<void> {
    const run = this.#runs.find((kept) => kept.scanId === scanId)
    if (run !== undefined) run.notified = true
    return Promise.resolve()
  }

  retryLater(scanId: string, after: Date, attempts: number): Promise<void> {
    const run = this.#runs.find((kept) => kept.scanId === scanId)
    if (run !== undefined) {
      run.retryAfter = after
      run.attempts = attempts
    }
    return Promise.resolve()
  }

  alerts(userId: string): Promise<StoredAlerts> {
    return Promise.resolve(this.#alerts.get(userId) ?? defaultAlerts(userId))
  }

  async saveAlerts(userId: string, patch: AlertsPatch): Promise<StoredAlerts> {
    const next = applyAlerts(await this.alerts(userId), patch)
    this.#alerts.set(userId, next)
    return next
  }

  async delivered(
    userId: string,
    ok: boolean,
    at: Date,
    maxFailures: number,
  ): Promise<StoredAlerts> {
    const current = await this.alerts(userId)
    if (current.webhook === null) return current
    const failures = ok ? 0 : current.webhook.failures + 1
    const disabledAt = current.webhook.disabledAt ?? (!ok && failures >= maxFailures ? at : null)
    const next = { ...current, webhook: { ...current.webhook, failures, disabledAt } }
    this.#alerts.set(userId, next)
    return next
  }

  async reenable(userId: string): Promise<void> {
    const current = await this.alerts(userId)
    if (current.webhook !== null) {
      this.#alerts.set(userId, {
        ...current,
        webhook: { ...current.webhook, failures: 0, disabledAt: null },
      })
    }
  }

  async summarized(userId: string, at: Date): Promise<void> {
    this.#alerts.set(userId, { ...(await this.alerts(userId)), lastSummaryAt: at })
  }

  eraseUser(userId: string): Promise<void> {
    for (const monitor of [...this.#monitors.values()]) {
      if (monitor.userId !== userId) continue
      this.#monitors.delete(monitor.siteId)
      for (let index = this.#runs.length - 1; index >= 0; index--) {
        if (this.#runs[index]?.siteId === monitor.siteId) this.#runs.splice(index, 1)
      }
    }
    this.#alerts.delete(userId)
    return Promise.resolve()
  }
}
