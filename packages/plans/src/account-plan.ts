import { accountsModeFrom } from './auth-limits'
import type { PlanOverrides } from './overrides'
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
  /** The most pages one deep crawl of a saved site checks (M4.5). */
  readonly crawlPages: number
  /** The PDF exports one account may make in a calendar month (M4.7). */
  readonly pdfPerMonth: number
  /** Whether the account may put its own name, colour and logo on its PDFs and shared reports (M4.7). */
  readonly whiteLabel: boolean
  /** With white-label: whether a small "by Arablyzer" line stays under the company's mark. */
  readonly whiteLabelCredit: boolean
  /** The API keys the account may hold at once (M5.1). */
  readonly apiKeys: number
  /**
   * How many of the window's scans the API may start (M5.1): a cap inside the account's own
   * bucket, never a second allowance. Null = the API shares the whole bucket; 0 = this plan has
   * no API.
   */
  readonly apiScans: number | null
  /** Requests one API key may make per minute, reads included; scans have their own bucket. */
  readonly apiRequests: number
}

export interface PlanCatalog {
  readonly account: AccountPlan
  /** Paid plans exist as configuration only until M4.4; nothing resolves a person to one yet. */
  readonly pro: AccountPlan | null
  readonly agency: AccountPlan | null
  /**
   * The owner's per-account numbers (M4.8), looked up where a quota is read; absent, there are
   * none. A catalog from `planCatalogFrom` has none: the API adds the lookup it has.
   */
  readonly overrides?: (userId: string) => Promise<PlanOverrides | null>
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
  // The owner's free-plan default for the deep crawl (M4.5): 50 pages, as the task fixed it.
  crawlPages: 50,
  // M4.7: three PDF exports a month for the free account, and no white-label until a plan has it.
  pdfPerMonth: 3,
  whiteLabel: false,
  whiteLabelCredit: true,
  // M5.1: two keys, the account's whole scan bucket, and a request budget that polling fits in.
  apiKeys: 2,
  apiScans: null,
  apiRequests: 120,
})

const FIELDS = ['SCANS', 'SCAN_SECONDS', 'INFLIGHT', 'SAVED_SITES', 'HISTORY_DAYS'] as const
/** Read when set, and the design's own numbers when not (also in production): they are not the owner's open ones. */
type OptionalField =
  | 'MONITORED_SITES'
  | 'MONITOR_EVERY_DAYS'
  | 'CRAWL_PAGES'
  | 'PDF_PER_MONTH'
  | 'WHITE_LABEL'
  | 'WHITE_LABEL_CREDIT'
  | 'API_KEYS'
  | 'API_SCANS'
  | 'API_REQUESTS'
const name = (plan: PlanId, field: (typeof FIELDS)[number] | OptionalField) =>
  `ARABLYZER_PLAN_${plan.toUpperCase()}_${field}`

/** The history days alone, for the worker's retention sweep (apps/worker); null with accounts off. */
export function accountHistoryDaysFrom(env: Env): number | null {
  if (accountsModeFrom(env) !== 'on') return null
  return reader(env, 'Phase 4 design §2.4')(
    name('account', 'HISTORY_DAYS'),
    DEVELOPMENT_ACCOUNT_PLAN.historyDays,
  )
}

/** An on/off variable: `on`/`off` (also 1/0, true/false); unset keeps the fallback, anything else is a mistake. */
function readSwitch(env: Env, variable: string, fallback: boolean): boolean {
  const raw = env[variable]?.trim().toLowerCase() ?? ''
  if (raw === '') return fallback
  if (['on', '1', 'true'].includes(raw)) return true
  if (['off', '0', 'false'].includes(raw)) return false
  throw new Error(`${variable} must be on or off, not ${raw}`)
}

/** The API's share of the scans: unset keeps the fallback (null = all of the bucket), 0 closes the API. */
function readApiScans(env: Env, variable: string, fallback: number | null): number | null {
  const raw = env[variable]?.trim() ?? ''
  if (raw === '') return fallback
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new Error(`${variable} must be a whole number of scans, 0 or more, not ${raw}`)
  }
  return Number(raw)
}

function planFrom(env: Env, id: PlanId, fallback: AccountPlan): AccountPlan {
  const read = reader(env, 'Phase 4 design §2.4')
  // Monitoring's two numbers are optional: unset, the design's (1 site, every 7 days) stand.
  const readOptional = (field: OptionalField, value: number): number =>
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
    crawlPages: readOptional('CRAWL_PAGES', fallback.crawlPages),
    pdfPerMonth: readOptional('PDF_PER_MONTH', fallback.pdfPerMonth),
    whiteLabel: readSwitch(env, name(id, 'WHITE_LABEL'), fallback.whiteLabel),
    whiteLabelCredit: readSwitch(env, name(id, 'WHITE_LABEL_CREDIT'), fallback.whiteLabelCredit),
    apiKeys: readOptional('API_KEYS', fallback.apiKeys),
    apiScans: readApiScans(env, name(id, 'API_SCANS'), fallback.apiScans),
    apiRequests: readOptional('API_REQUESTS', fallback.apiRequests),
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
