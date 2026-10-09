import type { EgressPolicy, Resolver } from '@arablyzer/egress'
import type { PlanCatalog, ScanLimits } from '@arablyzer/plans'
import {
  hostLimitKey,
  quietly,
  type InFlight,
  type MonitorData,
  type PendingRun,
  type RateLimiter,
  type ScanEvents,
  type ScanQueue,
  type ScanRecord,
  type ScanStore,
  type DueMonitor,
} from '@arablyzer/store'
import { planOf } from '../accounts'
import { holdPlace } from '../places'
import { parseTarget, resolveTarget } from '../target'
import { eventsOf, factsOf, MAX_FAILURES, type Facts } from './evaluate'
import type { Mailer } from './mail'
import {
  alertMessage,
  reportUrl,
  siteLabel,
  summaryMessage,
  type Language,
  type RunInfo,
} from './messages'
import { DAY_MS, MINUTE_MS, nextRunAfter, type Random } from './schedule'
import type { AlertMessage, WebhookSender } from './webhook'

export interface SchedulerDeps {
  readonly monitors: MonitorData
  readonly store: ScanStore
  readonly queue: ScanQueue
  readonly events: ScanEvents
  readonly limiter: RateLimiter
  readonly inFlight: InFlight
  readonly limits: ScanLimits
  readonly plans: PlanCatalog
  readonly policy: EgressPolicy
  readonly resolver: Resolver
  readonly sender: WebhookSender
  readonly mail: Mailer
  /** The site's origin, for the links in a message. */
  readonly origin: string
  readonly newId: () => string
  readonly now?: () => Date
  readonly random?: Random
  readonly log?: (message: string) => void
}

/** How many monitors one tick starts at most: runs are spread, not bursts. */
export const BATCH = 5
/** How long a claimed monitor is held for the scheduler that claimed it. */
export const LEASE_MS = 10 * MINUTE_MS
/** A scan that has been queued this long was lost between the store and the queue. */
export const STUCK_MS = 60 * MINUTE_MS
/** The wait before a delivery is tried again, after the first, second, … failure. */
export const BACKOFF_MS = [1, 5, 30, 120, 360].map((minutes) => minutes * MINUTE_MS)
/** Deliveries tried for one run before it is given up. */
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1
/** Failed deliveries in a row after which a webhook is turned off. */
export const MAX_WEBHOOK_FAILURES = 5
/** The shortest time between two weekly summaries (an hour short of a week, for the schedule's drift). */
export const SUMMARY_EVERY_MS = 7 * DAY_MS - 60 * MINUTE_MS

const TERMINAL = new Set(['complete', 'partial', 'failed'])

/** The queue room monitors may use: half of the cap, so a visitor is never behind them. */
export const monitorQueueRoom = (limits: ScanLimits): number =>
  Math.max(1, Math.floor(limits.queue / 2))

export interface Scheduler {
  /** Starts what is due, then decides the alerts of what has ended. */
  tick(): Promise<void>
}

/**
 * The monitoring scheduler (M4.3). One tick claims the monitors that are due and starts a scan
 * for each the way a person's own scan starts (their place, the DNS vetting, the host's bucket,
 * the queue) but only into the queue's lower half; then reads the scans that have ended and sends
 * the alerts. It keeps no state of its own: the claim is a lease in the store, the slot of a run
 * is unique, and what an alert says is read from the scans, so a second scheduler or a restart
 * repeats nothing.
 */
export function createScheduler(deps: SchedulerDeps): Scheduler {
  const now = deps.now ?? (() => new Date())
  const random = deps.random ?? Math.random
  const told = quietly('Monitor', deps.log)
  const tell = (error: unknown) => {
    told(new Error(error instanceof Error ? error.message : 'A monitor step failed'))
  }
  /** A deferred monitor waits a few minutes, spread, then tries again. */
  const later = (at: Date, base = 5) =>
    new Date(at.getTime() + Math.floor((base + random() * 10) * MINUTE_MS))

  async function launch(due: DueMonitor): Promise<void> {
    const { monitor, url } = due
    const at = now()
    const plan = planOf(deps.plans, monitor.userId)
    // A downgrade pauses the extras, and the interval never goes below the plan's: checked on every run.
    await deps.monitors.pauseExtras(monitor.userId, plan.monitoredSites)
    const current = await deps.monitors.monitor(monitor.userId, monitor.siteId)
    if (current === null || current.paused) return
    const everyDays = Math.max(monitor.everyDays, plan.monitorEveryDays)
    const next = nextRunAfter(at, everyDays, random)
    const holder = `account:${monitor.userId}`
    const id = deps.newId()
    // The person's own scan in flight (their plan allows so many at once) defers this one.
    if (!(await holdPlace(deps, holder, id, plan.inFlight, at.getTime()))) {
      await deps.monitors.defer(monitor.siteId, later(at))
      return
    }
    let queued = false
    try {
      const parsed = parseTarget(url, deps.policy)
      const resolved = parsed.ok
        ? await resolveTarget(parsed.value, deps.policy, deps.resolver)
        : parsed
      const record = {
        userId: monitor.userId,
        siteId: monitor.siteId,
        scanId: id,
        url,
        scheduledFor: due.scheduledFor,
        at,
        everyDays,
        nextRunAt: next,
      }
      if (!resolved.ok) {
        // The name no longer resolves to a public address: the site is down, as far as we can tell.
        // The run is recorded as a failed scan, so it alerts like any other failure.
        await deps.store.create({ id, url, createdAt: at })
        await deps.monitors.recordRun(record)
        await deps.store.fail(id, at)
        await deps.events.publish(id, { type: 'error' }).catch(() => '')
        return
      }
      if (parsed.ok) {
        const host = await deps.limiter.take(
          hostLimitKey(parsed.value.host),
          deps.limits.perHost,
          at.getTime(),
        )
        if (!host.ok) {
          await deps.monitors.defer(
            monitor.siteId,
            later(at, Math.ceil(host.retryAfterSeconds / 60)),
          )
          return
        }
      }
      const ahead = await deps.queue.waiting()
      if (ahead >= monitorQueueRoom(deps.limits)) {
        await deps.monitors.defer(monitor.siteId, later(at))
        return
      }
      // Stored, recorded and announced before it is queued, so the worker never starts a scan whose
      // record is not there yet; a failure after the record fails the scan at once.
      await deps.store.create({ id, url: resolved.value, createdAt: at })
      try {
        await deps.monitors.recordRun({ ...record, url: resolved.value })
        await deps.events.publish(id, { type: 'queued', ahead })
        await deps.queue.add({ id, url: resolved.value })
      } catch (error) {
        await deps.store.fail(id, at).catch(() => false)
        await deps.events.publish(id, { type: 'error' }).catch(() => '')
        throw error
      }
      queued = true
    } finally {
      if (!queued) await deps.inFlight.release(holder, [id]).catch(() => undefined)
    }
  }

  async function start(): Promise<void> {
    const at = now()
    const room = monitorQueueRoom(deps.limits) - (await deps.queue.waiting())
    if (room <= 0) return
    const claimed = await deps.monitors.claimDue(
      at,
      Math.min(BATCH, room),
      new Date(at.getTime() + LEASE_MS),
    )
    for (const due of claimed) {
      try {
        await launch(due)
      } catch (error) {
        // The lease ends by itself, and the slot is tried again then.
        tell(error)
      }
    }
  }

  /** Whether to try a delivery again, and when. */
  const failedAttempt = async (run: PendingRun, at: Date): Promise<void> => {
    const attempts = run.attempts + 1
    if (attempts >= MAX_ATTEMPTS) {
      await deps.monitors.settle(run.scanId, at)
      return
    }
    await deps.monitors.retryLater(
      run.scanId,
      new Date(at.getTime() + (BACKOFF_MS[attempts - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1] ?? 0)),
      attempts,
    )
  }

  /** Sends to the webhook, and the mail if there is any; true when every channel wanted got it. */
  async function deliver(
    run: PendingRun,
    message: AlertMessage,
    subject: string,
    at: Date,
  ): Promise<boolean> {
    const alerts = await deps.monitors.alerts(run.userId)
    const results: boolean[] = []
    const { webhook } = alerts
    if (webhook !== null && webhook.disabledAt === null) {
      const sent = await deps.sender
        .send(webhook, message)
        .catch(() => ({ ok: false, status: null }))
      await deps.monitors.delivered(run.userId, sent.ok, at, MAX_WEBHOOK_FAILURES)
      results.push(sent.ok)
    }
    if (alerts.email && deps.mail.available) {
      results.push(
        await deps.mail
          .send({ to: run.email, subject, text: message.lines.join('\n') })
          .catch(() => false),
      )
    }
    return results.every(Boolean)
  }

  /** The scan of the run, or null when it is gone; a scan lost between the store and the queue is failed. */
  async function ended(run: PendingRun, at: Date): Promise<ScanRecord | null> {
    let scan = await deps.store.get(run.scanId)
    if (scan === null) return null
    if (
      !TERMINAL.has(scan.state) &&
      at.getTime() - run.createdAt.getTime() > STUCK_MS &&
      scan.state === 'queued'
    ) {
      await deps.store.fail(scan.id, at)
      scan = await deps.store.get(scan.id)
    }
    return scan !== null && TERMINAL.has(scan.state) ? scan : null
  }

  async function settleOne(
    run: PendingRun,
    at: Date,
  ): Promise<{ info: RunInfo; language: Language; run: PendingRun } | null> {
    const scan = await ended(run, at)
    if (scan === null) {
      // Gone (the history sweep or the person deleted it): nothing to say.
      if ((await deps.store.get(run.scanId)) === null) await deps.monitors.settle(run.scanId, at)
      return null
    }
    const monitor = await deps.monitors.monitor(run.userId, run.siteId)
    if (monitor === null) {
      await deps.monitors.settle(run.scanId, at)
      return null
    }
    const previousId = await deps.monitors.previousScan(run.siteId, scan.createdAt)
    const previous = previousId === null ? null : await deps.store.get(previousId)
    const facts: Facts = factsOf(scan, previous)
    // The failure count moves once per run: a retry of a delivery reads it, it does not move it again.
    const consecutive = facts.unreachable
      ? run.attempts === 0
        ? monitor.failures + 1
        : monitor.failures
      : 0
    if (run.attempts === 0) {
      await deps.monitors.setHealth(run.siteId, {
        failures: consecutive,
        paused: monitor.paused || consecutive >= MAX_FAILURES,
      })
    }
    const language: Language = run.language === 'en' ? 'en' : 'ar'
    const info: RunInfo = {
      url: run.url,
      scanId: run.scanId,
      report: reportUrl(deps.origin, language, run.scanId),
      facts,
    }
    const alerts = await deps.monitors.alerts(run.userId)
    const events = eventsOf(facts, alerts, consecutive)
    if (events.length === 0) {
      await deps.monitors.settle(run.scanId, at)
    } else {
      const message = alertMessage(language, info, events, at)
      const delivered = await deliver(run, message, `Arablyzer: ${siteLabel(run.url)}`, at).catch(
        (error: unknown) => {
          tell(error)
          return false
        },
      )
      if (delivered) await deps.monitors.settle(run.scanId, at)
      else await failedAttempt(run, at)
    }
    return { info, language, run }
  }

  async function settle(): Promise<void> {
    const at = now()
    const runs = await deps.monitors.pending(at, 25)
    const results = new Map<string, { info: RunInfo; language: Language; run: PendingRun }[]>()
    for (const run of runs) {
      try {
        const result = await settleOne(run, at)
        // Only a first look counts for the summary: a retried delivery was summarised already.
        if (result !== null && run.attempts === 0) {
          results.set(run.userId, [...(results.get(run.userId) ?? []), result])
        }
      } catch (error) {
        tell(error)
      }
    }
    for (const [userId, done] of results) {
      try {
        const alerts = await deps.monitors.alerts(userId)
        const last = alerts.lastSummaryAt
        if (
          !alerts.weeklySummary ||
          (last !== null && at.getTime() - last.getTime() < SUMMARY_EVERY_MS)
        )
          continue
        const first = done[0]
        if (first === undefined) continue
        const message = summaryMessage(
          first.language,
          done.map((d) => d.info),
          at,
        )
        if (await deliver(first.run, message, 'Arablyzer', at))
          await deps.monitors.summarized(userId, at)
      } catch (error) {
        tell(error)
      }
    }
  }

  return {
    async tick() {
      // Decide what has ended first: an alert should not wait behind a slow start.
      await settle().catch(tell)
      await start().catch(tell)
    },
  }
}
