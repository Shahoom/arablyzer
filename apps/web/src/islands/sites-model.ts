import {
  URL_ERROR_CODES,
  type AccountScan,
  type AccountScansResponse,
  type AlertSettings,
  type AlertsResponse,
  type MonitorPoint,
  type MonitorResponse,
  type MonitorSummary,
  type SiteSummary,
  type SitesResponse,
  type UrlErrorCode,
  type WebhookTestResponse,
} from '@arablyzer/api-contract/codes'
import { localePath, type Lang } from '@arablyzer/seo/site'
import { problemOf, type AuthProblem } from './auth-model'
import { isCrawlSummary } from './crawl-model'

/** What a request about saved sites can come to besides success: an account problem, or a URL's. */
export type SiteProblem =
  | AuthProblem
  | UrlErrorCode
  | 'turnstile-failed'
  | 'empty'
  /** Turning monitoring on would pass the plan's number of monitored sites. */
  | 'monitor-limit'

const isUrlCode = (value: unknown): value is UrlErrorCode =>
  typeof value === 'string' && (URL_ERROR_CODES as readonly string[]).includes(value)

/** An error answer of the sites routes: a scan's URL code, or an account code with its wait. */
export function siteProblemOf(
  status: number,
  body: unknown,
): { problem: SiteProblem; retryAfterSeconds?: number } {
  const code =
    typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : null
  if (isUrlCode(code) || code === 'turnstile-failed') return { problem: code }
  return problemOf(status, body)
}

const STATES = ['queued', 'running', 'complete', 'partial', 'failed']

function isScan(value: unknown): value is AccountScan {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.url === 'string' &&
    typeof v.state === 'string' &&
    STATES.includes(v.state) &&
    (v.score === null || typeof v.score === 'number') &&
    typeof v.createdAt === 'string' &&
    (v.siteId === null || typeof v.siteId === 'string')
  )
}

const isPoint = (value: unknown): value is MonitorPoint => {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.scanId === 'string' &&
    typeof v.state === 'string' &&
    STATES.includes(v.state) &&
    (v.score === null || typeof v.score === 'number') &&
    typeof v.at === 'string'
  )
}

export function isMonitorSummary(value: unknown): value is MonitorSummary {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.everyDays === 'number' &&
    typeof v.paused === 'boolean' &&
    typeof v.nextRunAt === 'string' &&
    typeof v.failures === 'number' &&
    Array.isArray(v.trend) &&
    (v.trend as unknown[]).every(isPoint)
  )
}

export function isSiteSummary(value: unknown): value is SiteSummary {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.url === 'string' &&
    typeof v.createdAt === 'string' &&
    (v.lastScan === null || isScan(v.lastScan)) &&
    (v.monitor === null || isMonitorSummary(v.monitor)) &&
    (v.crawl === null || isCrawlSummary(v.crawl))
  )
}

export function isMonitorResponse(value: unknown): value is MonitorResponse {
  if (typeof value !== 'object' || value === null) return false
  const monitor = (value as Record<string, unknown>).monitor
  return monitor === null || isMonitorSummary(monitor)
}

export function isAlertSettings(value: unknown): value is AlertSettings {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  const webhook = v.webhook as Record<string, unknown> | null
  const email = v.email as Record<string, unknown> | null
  return (
    (webhook === null ||
      (typeof webhook === 'object' &&
        typeof webhook.host === 'string' &&
        typeof webhook.kind === 'string' &&
        typeof webhook.failures === 'number' &&
        typeof webhook.disabled === 'boolean')) &&
    typeof v.dropThreshold === 'number' &&
    typeof v.onCritical === 'boolean' &&
    typeof v.onDown === 'boolean' &&
    typeof v.weeklySummary === 'boolean' &&
    typeof email === 'object' &&
    email !== null &&
    typeof email.available === 'boolean' &&
    typeof email.enabled === 'boolean'
  )
}

export const isAlertsResponse = (value: unknown): value is AlertsResponse =>
  isAlertSettings(value) &&
  (!('secret' in value) || value.secret === undefined || typeof value.secret === 'string')

export function isTestResponse(value: unknown): value is WebhookTestResponse {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.ok === 'boolean' && (v.status === null || typeof v.status === 'number')
}

export function isSitesResponse(value: unknown): value is SitesResponse {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  const monitoring = v.monitoring as Record<string, unknown> | null | undefined
  return (
    typeof v.limit === 'number' &&
    typeof v.crawlPages === 'number' &&
    typeof monitoring === 'object' &&
    monitoring !== null &&
    typeof monitoring.limit === 'number' &&
    typeof monitoring.everyDays === 'number' &&
    Array.isArray(v.sites) &&
    (v.sites as unknown[]).every(isSiteSummary)
  )
}

export function isAccountScansResponse(value: unknown): value is AccountScansResponse {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.historyDays === 'number' &&
    Array.isArray(v.scans) &&
    (v.scans as unknown[]).every(isScan)
  )
}

/** The page of a scan's report, in a language. */
export function reportHref(lang: Lang, id: string): string {
  return localePath(lang, `/r/${id}`)
}

/** An address as a list shows it: the scheme and a lone trailing slash are noise; the rest stays. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

/** A date for a list, in the page's language, with Western digits as the rest of the site has. */
export function dayLabel(iso: string, lang: Lang): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(date)
}

/** The scores of a trend as the chart's alternative text says them: «82, 80, no score, 74». */
export function trendText(trend: readonly MonitorPoint[], noScore: string): string {
  return trend.map((point) => (point.score === null ? noScore : String(point.score))).join(', ')
}

/**
 * The polyline of a trend in a 100 × 32 box (the SVG's own units, so the page draws no style):
 * scores 0 to 100 from the bottom, the runs evenly across. A run with no score has no point and
 * breaks the line. Returns the runs of points that are joined, and the last point if it has a score.
 */
export function sparkline(trend: readonly MonitorPoint[]): {
  readonly lines: readonly string[]
  readonly last: { readonly x: number; readonly y: number } | null
} {
  const width = 100
  const height = 32
  const pad = 3
  const step = trend.length > 1 ? (width - 2 * pad) / (trend.length - 1) : 0
  const lines: string[] = []
  let current: string[] = []
  let last: { x: number; y: number } | null = null
  for (const [index, point] of trend.entries()) {
    if (point.score === null) {
      if (current.length > 0) lines.push(current.join(' '))
      current = []
      last = null
      continue
    }
    const x = trend.length > 1 ? pad + index * step : width / 2
    const y = Math.round((pad + (1 - point.score / 100) * (height - 2 * pad)) * 10) / 10
    current.push(`${String(Math.round(x * 10) / 10)},${String(y)}`)
    last = { x: Math.round(x * 10) / 10, y }
  }
  if (current.length > 0) lines.push(current.join(' '))
  return { lines, last }
}

/** How a webhook's signature is made: the formula shown beside the secret, the same in every language. */
export const SIGNATURE_RECIPE = 'sha256=HMAC_SHA256(secret, timestamp + "." + body)'
