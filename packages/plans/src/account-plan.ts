import { accountsModeFrom } from './auth-limits'
import { reader, type Env } from './reader'
import type { ScanLimits, Window } from './index'

/** The plans an account can be on (Phase 4 design §2.1); `anonymous` is `ScanLimits`, not a plan here. */
export type PlanId = 'account' | 'pro' | 'agency'

/**
 * What a plan allows a signed-in person (Phase 4 design §2.3). Every number is read from the
 * environment, not written into a route or a string; the pages read them from the API's answers.
 */
export interface AccountPlan {
  readonly id: PlanId
  /** The account's scans: a token bucket that refills evenly over the window, keyed by account. */
  readonly scans: Window
  /** The scans the account may have queued or running at once. */
  readonly inFlight: number
  /** The sites the account may save. */
  readonly savedSites: number
  /** How many days the account's scans (and their reports) are kept. */
  readonly historyDays: number
  /** The saved sites that may be monitored at once (M4.3). */
  readonly monitoredSites: number
  /** The fewest days between two scans of a monitored site (M4.3). */
  readonly monitorEveryDays: number
}

export interface PlanCatalog {
  readonly account: AccountPlan
  /** Paid plans exist as configuration only until M4.4; nothing resolves a person to one yet. */
  readonly pro: AccountPlan | null
  readonly agency: AccountPlan | null
}

/**
 * For development and tests only, until the owner sets the real numbers (Phase 4 design §2.4).
 * Production never falls back to these: planCatalogFrom() refuses to start without its own.
 */
export const DEVELOPMENT_ACCOUNT_PLAN: AccountPlan = Object.freeze({
  id: 'account',
  scans: Object.freeze({ scans: 30, seconds: 3600 }),
  inFlight: 3,
  savedSites: 5,
  historyDays: 90,
  // The one pair the design fixes itself: a weekly scan of one site for the free account (§3, §17).
  monitoredSites: 1,
  monitorEveryDays: 7,
})

const FIELDS = ['SCANS', 'SCAN_SECONDS', 'INFLIGHT', 'SAVED_SITES', 'HISTORY_DAYS'] as const
/** Read when set, and the design's own numbers when not (also in production): they are not the owner's open ones. */
const OPTIONAL_FIELDS = ['MONITORED_SITES', 'MONITOR_EVERY_DAYS'] as const
const name = (plan: PlanId, field: (typeof FIELDS)[number] | (typeof OPTIONAL_FIELDS)[number]) =>
  `ARABLYZER_PLAN_${plan.toUpperCase()}_${field}`

/** The history days alone, for the worker's retention sweep (apps/worker); null with accounts off. */
export function accountHistoryDaysFrom(env: Env): number | null {
  if (accountsModeFrom(env) !== 'on') return null
  return reader(env, 'Phase 4 design §2.4')(
    name('account', 'HISTORY_DAYS'),
    DEVELOPMENT_ACCOUNT_PLAN.historyDays,
  )
}

function planFrom(env: Env, id: PlanId, fallback: AccountPlan): AccountPlan {
  const read = reader(env, 'Phase 4 design §2.4')
  // Monitoring's two numbers are optional: unset, the design's (1 site, every 7 days) stand.
  const readOptional = (field: (typeof OPTIONAL_FIELDS)[number], value: number): number =>
    (env[name(id, field)]?.trim() ?? '') === '' ? value : read(name(id, field), value)
  return Object.freeze({
    id,
    scans: Object.freeze({
      scans: read(name(id, 'SCANS'), fallback.scans.scans),
      seconds: read(name(id, 'SCAN_SECONDS'), fallback.scans.seconds),
    }),
    inFlight: read(name(id, 'INFLIGHT'), fallback.inFlight),
    savedSites: read(name(id, 'SAVED_SITES'), fallback.savedSites),
    historyDays: read(name(id, 'HISTORY_DAYS'), fallback.historyDays),
    monitoredSites: readOptional('MONITORED_SITES', fallback.monitoredSites),
    monitorEveryDays: readOptional('MONITOR_EVERY_DAYS', fallback.monitorEveryDays),
  })
}

/** A paid plan is configured with all five numbers or none; half of one is a mistake. */
function optionalPlan(env: Env, id: 'pro' | 'agency'): AccountPlan | null {
  const set = FIELDS.filter((field) => (env[name(id, field)]?.trim() ?? '') !== '')
  if (set.length === 0) return null
  if (set.length < FIELDS.length) {
    throw new Error(`${id} needs all of ${FIELDS.map((f) => name(id, f)).join(', ')}, or none`)
  }
  return planFrom(env, id, DEVELOPMENT_ACCOUNT_PLAN)
}

/** The rate a window allows, in scans per second. */
const rate = (window: Window) => window.scans / window.seconds

/**
 * The plans from the environment. In production the account plan's five numbers must be set;
 * elsewhere those not set keep their development values. A plan may not give a signed-in person
 * less than the anonymous visitor has (Phase 4 design §6): it refuses to start rather than do so.
 */
export function planCatalogFrom(env: Env, anonymous: ScanLimits): PlanCatalog {
  const catalog: PlanCatalog = Object.freeze({
    account: planFrom(env, 'account', DEVELOPMENT_ACCOUNT_PLAN),
    pro: optionalPlan(env, 'pro'),
    agency: optionalPlan(env, 'agency'),
  })
  for (const plan of [catalog.account, catalog.pro, catalog.agency]) {
    if (plan === null) continue
    if (rate(plan.scans) < rate(anonymous.perConnection)) {
      throw new Error(`The ${plan.id} plan's scans are fewer than an anonymous visitor's`)
    }
    if (plan.inFlight < anonymous.inFlight) {
      throw new Error(
        `The ${plan.id} plan's concurrent scans are fewer than an anonymous visitor's`,
      )
    }
  }
  return catalog
}
