import {
  URL_ERROR_CODES,
  type AccountScan,
  type AccountScansResponse,
  type SiteSummary,
  type SitesResponse,
  type UrlErrorCode,
} from '@arablyzer/api-contract/codes'
import { localePath, type Lang } from '@arablyzer/seo/site'
import { problemOf, type AuthProblem } from './auth-model'

/** What a request about saved sites can come to besides success: an account problem, or a URL's. */
export type SiteProblem = AuthProblem | UrlErrorCode | 'turnstile-failed' | 'empty'

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

export function isSiteSummary(value: unknown): value is SiteSummary {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.url === 'string' &&
    typeof v.createdAt === 'string' &&
    (v.lastScan === null || isScan(v.lastScan))
  )
}

export function isSitesResponse(value: unknown): value is SitesResponse {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.limit === 'number' &&
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
