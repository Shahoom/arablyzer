import type { GscInspection, GscMetrics, GscResult, GscRow } from '@arablyzer/api-contract/codes'

type Property = NonNullable<GscResult['property']>

/** The permission levels that can read a property's data; an unverified user cannot. */
const READABLE: ReadonlySet<string> = new Set(['siteOwner', 'siteFullUser', 'siteRestrictedUser'])

/** The 28 days ending two days ago, where Search Console's data is final (UTC dates). */
export function periodOf(now: Date): { start: string; end: string } {
  const day = 24 * 60 * 60 * 1000
  const end = new Date(now.getTime() - 2 * day)
  const start = new Date(end.getTime() - 27 * day)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown, max = 2048): string | null =>
  typeof value === 'string' && value !== '' ? value.slice(0, max) : null

/**
 * The property of the user's that covers the page: a domain property (`sc-domain:`) first, the one
 * for the most specific domain; else the URL-prefix property whose prefix is the longest start of
 * the page's address, on its scheme. Properties the user cannot read are skipped. Null when none.
 */
export function pickProperty(sites: unknown, pageUrl: string): Property | null {
  let page: URL
  try {
    page = new URL(pageUrl)
  } catch {
    return null
  }
  const host = page.hostname.toLowerCase().replace(/\.$/, '')
  const entries = isObject(sites) && Array.isArray(sites.siteEntry) ? sites.siteEntry : []
  const readable = (entries as unknown[]).flatMap((entry) => {
    if (!isObject(entry) || typeof entry.permissionLevel !== 'string') return []
    const siteUrl = text(entry.siteUrl)
    return siteUrl !== null && READABLE.has(entry.permissionLevel) ? [siteUrl] : []
  })
  let domain: string | null = null
  for (const siteUrl of readable) {
    if (!siteUrl.startsWith('sc-domain:')) continue
    const name = siteUrl.slice('sc-domain:'.length).toLowerCase()
    if (name === '' || !(host === name || host.endsWith(`.${name}`))) continue
    if (domain === null || name.length > domain.length - 'sc-domain:'.length) domain = siteUrl
  }
  if (domain !== null) return { siteUrl: domain, kind: 'domain' }
  let prefix: URL | null = null
  let prefixUrl: string | null = null
  for (const siteUrl of readable) {
    let candidate: URL
    try {
      candidate = new URL(siteUrl)
    } catch {
      continue
    }
    if (candidate.protocol !== page.protocol || candidate.host !== page.host) continue
    if (!page.pathname.startsWith(candidate.pathname)) continue
    if (prefix === null || candidate.pathname.length > prefix.pathname.length) {
      prefix = candidate
      prefixUrl = siteUrl
    }
  }
  return prefixUrl === null ? null : { siteUrl: prefixUrl, kind: 'prefix' }
}

function metrics(row: Record<string, unknown>): GscMetrics | null {
  const { clicks, impressions, ctr, position } = row
  const numbers = [clicks, impressions, ctr, position]
  if (!numbers.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return null
  return {
    clicks: clicks as number,
    impressions: impressions as number,
    ctr: ctr as number,
    position: position as number,
  }
}

/** The single row of a query with no dimension; null when Google gave none. */
export function shapeTotals(body: unknown): GscMetrics | null {
  const rows = isObject(body) && Array.isArray(body.rows) ? body.rows : []
  const first: unknown = rows[0]
  return isObject(first) ? metrics(first) : null
}

/** The rows of a query with one dimension, in Google's order (by clicks), at most `limit`. */
export function shapeRows(body: unknown, limit: number): GscRow[] {
  const rows = isObject(body) && Array.isArray(body.rows) ? (body.rows as unknown[]) : []
  return rows
    .flatMap((row): GscRow[] => {
      if (!isObject(row) || !Array.isArray(row.keys)) return []
      const key = text(row.keys[0])
      const numbers = metrics(row)
      // A query or page of Arabic stays as it is: only its length is bounded.
      return key === null || numbers === null ? [] : [{ key, ...numbers }]
    })
    .slice(0, limit)
}

/** What URL Inspection returned of the page, with the fields it left out as null. */
export function shapeInspection(body: unknown): GscInspection | null {
  const result = isObject(body) ? body.inspectionResult : undefined
  if (!isObject(result)) return null
  const index = isObject(result.indexStatusResult) ? result.indexStatusResult : {}
  const mobile = isObject(result.mobileUsabilityResult) ? result.mobileUsabilityResult : null
  const issues =
    mobile !== null && Array.isArray(mobile.issues)
      ? (mobile.issues as unknown[]).flatMap((issue) => {
          const type = isObject(issue) ? text(issue.issueType, 100) : null
          return type === null ? [] : [type]
        })
      : []
  const time = text(index.lastCrawlTime, 40)
  return {
    verdict: text(index.verdict, 40),
    coverageState: text(index.coverageState, 200),
    indexingState: text(index.indexingState, 60),
    pageFetchState: text(index.pageFetchState, 60),
    robotsTxtState: text(index.robotsTxtState, 60),
    lastCrawlTime: time !== null && !Number.isNaN(Date.parse(time)) ? time : null,
    googleCanonical: text(index.googleCanonical),
    userCanonical: text(index.userCanonical),
    mobileUsability: mobile === null ? null : { verdict: text(mobile.verdict, 40), issues },
  }
}
