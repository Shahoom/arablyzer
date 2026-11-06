import {
  APP_PAGE_PATH,
  type AccountScan,
  type HistoryMarker,
  type ScanState,
  type SiteHistory,
  type SiteSummary,
} from '@arablyzer/api-contract/codes'
import type { AppNav } from '@arablyzer/i18n/app'
import { localePath, type Lang } from '@arablyzer/seo/site'

// What the dashboard (M4.9) works out from the API's answers, with no DOM: where its pages are, what
// a site's row says, the geometry of a sparkline and a donut, the meters, the alerts, the search and
// the scans' filter. Tested without a browser (test/app-model.test.ts).

/** The pages of the dashboard: the menu's nine, and one site's. */
export type AppPage = AppNav | 'site'

/** The last path segment of each page; the overview has none (`/app`). */
export const PAGE_SLUG: Readonly<Record<AppPage, string>> = {
  overview: '',
  sites: 'sites',
  site: 'site',
  scans: 'scans',
  monitoring: 'monitoring',
  crawls: 'crawls',
  pdfs: 'pdfs',
  keys: 'keys',
  brand: 'brand',
  account: 'account',
}

/** The menu, in its groups; a site's page belongs to «sites». */
export const NAV_GROUPS: readonly {
  readonly key: 'main' | 'follow' | 'build' | 'account'
  readonly items: readonly AppNav[]
}[] = [
  { key: 'main', items: ['overview', 'sites', 'scans'] },
  { key: 'follow', items: ['monitoring', 'crawls', 'pdfs'] },
  { key: 'build', items: ['keys', 'brand'] },
  { key: 'account', items: ['account'] },
]

/** The pages the build emits, with the path segment the rest route is given (`undefined` for `/app`). */
export const APP_ROUTES: readonly { readonly page: AppPage; readonly slug: string | undefined }[] =
  (Object.keys(PAGE_SLUG) as AppPage[]).map((page) => ({
    page,
    slug: PAGE_SLUG[page] === '' ? undefined : PAGE_SLUG[page],
  }))

export function pageOfSlug(slug: string | undefined): AppPage | null {
  const found = APP_ROUTES.find((route) => route.slug === slug)
  return found === undefined ? null : found.page
}

/** The address of a page in a language, with a query when it takes one (a site's id). */
export function appHref(
  lang: Lang,
  page: AppPage,
  query?: Readonly<Record<string, string>>,
): string {
  const slug = PAGE_SLUG[page]
  const path = slug === '' ? APP_PAGE_PATH : `${APP_PAGE_PATH}/${slug}`
  const search = query === undefined ? '' : `?${new URLSearchParams(query).toString()}`
  return `${localePath(lang, path)}${search}`
}

export const siteHref = (lang: Lang, siteId: string): string =>
  appHref(lang, 'site', { id: siteId })

/** The id a site's page was opened with: 22 letters, digits, `_` and `-`; null for anything else. */
export function siteIdOf(search: string): string | null {
  const id = new URLSearchParams(search).get('id')
  return id !== null && /^[A-Za-z0-9_-]{22}$/.test(id) ? id : null
}

/** An address as a name: the host, without `www.`. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** The letter in a site's tile: the first of its host. */
export const letterOf = (url: string): string => hostOf(url).charAt(0).toUpperCase() || '·'

export type Band = 'good' | 'mid' | 'low'

/** The cut-offs the report draws, 90 and 50. */
export const scoreBand = (score: number): Band =>
  score >= 90 ? 'good' : score >= 50 ? 'mid' : 'low'

// ---------------------------------------------------------------------------------------------
// Sites

export const SERIES_LENGTH = 12

export type MonitorState = 'monitored' | 'paused' | 'failing' | 'off'

export interface SiteRow {
  readonly site: SiteSummary
  readonly host: string
  /** The newest score, or null before one. */
  readonly score: number | null
  /** The newest score less the one before it. */
  readonly delta: number | null
  /** The scores of the last scans, oldest first. */
  readonly series: readonly number[]
  readonly lastAt: string | null
  readonly monitor: MonitorState
}

const reached = (scan: AccountScan): scan is AccountScan & { score: number } =>
  (scan.state === 'complete' || scan.state === 'partial') && scan.score !== null

/** The scores of a monitor's last runs, oldest first, without the runs that had none. */
export const trendScores = (trend: readonly { readonly score: number | null }[]): number[] =>
  trend.flatMap((point) => (point.score === null ? [] : [point.score]))

export function monitorState(site: SiteSummary): MonitorState {
  const { monitor } = site
  if (monitor === null) return 'off'
  if (monitor.paused) return 'paused'
  return monitor.failures > 0 ? 'failing' : 'monitored'
}

/** A site's rows: its newest scores come from the history of scans, and its last scan fills a gap. */
export function siteRows(sites: readonly SiteSummary[], scans: readonly AccountScan[]): SiteRow[] {
  return sites.map((site) => {
    const own = new Map<string, AccountScan & { score: number }>()
    for (const scan of scans) if (scan.siteId === site.id && reached(scan)) own.set(scan.id, scan)
    if (site.lastScan !== null && reached(site.lastScan)) own.set(site.lastScan.id, site.lastScan)
    const series = [...own.values()]
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .slice(-SERIES_LENGTH)
      .map((scan) => scan.score)
    const score = series[series.length - 1] ?? null
    const before = series[series.length - 2]
    return {
      site,
      host: hostOf(site.url),
      score,
      delta: score === null || before === undefined ? null : score - before,
      series,
      lastAt: site.lastScan?.createdAt ?? null,
      monitor: monitorState(site),
    }
  })
}

/** The mean score of the sites that have one, rounded; null when none has. */
export function averageScore(rows: readonly SiteRow[]): { value: number; scanned: number } | null {
  const scores = rows.flatMap((row) => (row.score === null ? [] : [row.score]))
  if (scores.length === 0) return null
  return {
    value: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    scanned: scores.length,
  }
}

export type SiteFilter = 'all' | 'monitored' | 'unmonitored'
export type SiteSort = 'recent' | 'worst' | 'name'

export function filterRows(
  rows: readonly SiteRow[],
  query: string,
  filter: SiteFilter,
  sort: SiteSort,
): SiteRow[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const kept = rows.filter((row) => {
    if (filter === 'monitored' && row.monitor === 'off') return false
    if (filter === 'unmonitored' && row.monitor !== 'off') return false
    const hay = `${row.host} ${row.site.url}`.toLowerCase()
    return terms.every((term) => hay.includes(term))
  })
  const time = (row: SiteRow) => (row.lastAt === null ? 0 : Date.parse(row.lastAt))
  return kept.sort((a, b) => {
    if (sort === 'name') return a.host.localeCompare(b.host, 'en')
    if (sort === 'worst') {
      // A site with no score goes last: there is nothing to fix yet.
      return (a.score ?? 101) - (b.score ?? 101) || a.host.localeCompare(b.host, 'en')
    }
    return time(b) - time(a) || a.host.localeCompare(b.host, 'en')
  })
}

// ---------------------------------------------------------------------------------------------
// Sparklines and the donut

export interface Spark {
  /** The line as an SVG path, empty for a single point. */
  readonly line: string
  /** The line closed down to the foot, for the soft fill under it. */
  readonly area: string
  readonly points: readonly { readonly x: number; readonly y: number }[]
}

const r1 = (n: number): number => Math.round(n * 10) / 10

/**
 * A series as a sparkline in a `width` by `height` box. The scale is the series' own (at least ten
 * points of range, so a steady site reads as steady), and time starts at the start edge: the right in
 * a right-to-left page, as the big chart's does.
 */
export function sparkOf(
  series: readonly number[],
  rtl: boolean,
  width = 120,
  height = 36,
  pad = 3,
): Spark {
  if (series.length === 0) return { line: '', area: '', points: [] }
  const min = Math.min(...series)
  const max = Math.max(...series)
  const span = Math.max(max - min, 10)
  const low = min - (span - (max - min)) / 2
  const inner = width - 2 * pad
  const points = series.map((value, index) => {
    const fraction = series.length === 1 ? 0.5 : index / (series.length - 1)
    const x = pad + (rtl ? 1 - fraction : fraction) * inner
    const y = pad + (1 - (value - low) / span) * (height - 2 * pad)
    return { x: r1(x), y: r1(y) }
  })
  if (points.length === 1) return { line: '', area: '', points }
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')
  const first = points[0]
  const last = points[points.length - 1]
  const area = `${line} L${last?.x ?? 0} ${height} L${first?.x ?? 0} ${height} Z`
  return { line, area, points }
}

export interface Arc {
  readonly key: string
  readonly value: number
  readonly dash: number
  readonly gap: number
  readonly offset: number
}

/** A donut's segments as dash arrays on one circle; a lone segment has no gap. */
export function donutArcs(
  parts: readonly { readonly key: string; readonly value: number }[],
  radius = 48,
): Arc[] {
  const kept = parts.filter((part) => part.value > 0)
  const total = kept.reduce((sum, part) => sum + part.value, 0)
  if (total === 0) return []
  const circumference = 2 * Math.PI * radius
  const gap = kept.length > 1 ? 3 : 0
  let used = 0
  return kept.map((part) => {
    const length = (part.value / total) * circumference
    const arc = {
      key: part.key,
      value: part.value,
      dash: r1(Math.max(length - gap, 0.5)),
      gap: r1(circumference - Math.max(length - gap, 0.5)),
      offset: used === 0 ? 0 : r1(-used),
    }
    used += length
    return arc
  })
}

/** The index of the x nearest to `x`; -1 for none. */
export function nearestIndex(xs: readonly number[], x: number): number {
  let best = -1
  let distance = Infinity
  xs.forEach((candidate, index) => {
    const d = Math.abs(candidate - x)
    if (d < distance) {
      distance = d
      best = index
    }
  })
  return best
}

// ---------------------------------------------------------------------------------------------
// Meters

export type MeterTone = 'ok' | 'near' | 'full' | 'none'

export interface Meter {
  readonly used: number
  readonly limit: number
  /** 0 to 1. */
  readonly ratio: number
  readonly tone: MeterTone
}

export function meterOf(used: number, limit: number): Meter {
  if (limit <= 0) return { used, limit, ratio: 0, tone: 'none' }
  const ratio = Math.min(1, Math.max(0, used / limit))
  return { used, limit, ratio, tone: ratio >= 1 ? 'full' : ratio >= 0.8 ? 'near' : 'ok' }
}

// ---------------------------------------------------------------------------------------------
// Alerts

export interface AlertItem {
  readonly id: string
  readonly siteId: string
  readonly url: string
  readonly scanId: string
  readonly at: string
  readonly kind: HistoryMarker['kind']
  readonly from?: number
  readonly to?: number
  readonly count?: number
}

/** The markers of the histories of monitored sites, newest first. A history that cannot mark has none. */
export function alertsOf(histories: readonly SiteHistory[]): AlertItem[] {
  const items: AlertItem[] = []
  for (const history of histories) {
    if (!history.alerts) continue
    for (const marker of history.markers) {
      items.push({
        id: `${history.siteId}:${marker.scanId}:${marker.kind}`,
        siteId: history.siteId,
        url: history.url,
        scanId: marker.scanId,
        at: marker.at,
        kind: marker.kind,
        ...(marker.from === undefined ? {} : { from: marker.from }),
        ...(marker.to === undefined ? {} : { to: marker.to }),
        ...(marker.count === undefined ? {} : { count: marker.count }),
      })
    }
  }
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

/** The monitored sites whose histories the overview reads, the ones scanned most recently first. */
export function monitoredToRead(rows: readonly SiteRow[], most = 6): SiteSummary[] {
  return rows
    .filter((row) => row.monitor !== 'off')
    .sort(
      (a, b) =>
        (b.lastAt === null ? 0 : Date.parse(b.lastAt)) -
        (a.lastAt === null ? 0 : Date.parse(a.lastAt)),
    )
    .slice(0, most)
    .map((row) => row.site)
}

// ---------------------------------------------------------------------------------------------
// Search

export type PaletteGroup = 'pages' | 'sites' | 'scans'

export interface PaletteItem {
  readonly id: string
  readonly group: PaletteGroup
  readonly label: string
  readonly hint: string
  readonly href: string
  /** An address is read left to right whatever the page. */
  readonly ltr: boolean
}

export function paletteItems(args: {
  readonly lang: Lang
  readonly pages: readonly { readonly page: AppNav; readonly label: string }[]
  readonly sites: readonly SiteSummary[]
  readonly scans: readonly AccountScan[]
  readonly siteHint: string
  readonly scanHint: (scan: AccountScan) => string
  readonly reportHref: (scan: AccountScan) => string
}): PaletteItem[] {
  return [
    ...args.pages.map(({ page, label }) => ({
      id: `page:${page}`,
      group: 'pages' as const,
      label,
      hint: '',
      href: appHref(args.lang, page),
      ltr: false,
    })),
    ...args.sites.map((site) => ({
      id: `site:${site.id}`,
      group: 'sites' as const,
      label: hostOf(site.url),
      hint: args.siteHint,
      href: siteHref(args.lang, site.id),
      ltr: true,
    })),
    ...args.scans.slice(0, 40).map((scan) => ({
      id: `scan:${scan.id}`,
      group: 'scans' as const,
      label: scan.url.replace(/^https?:\/\//i, '').replace(/\/$/, ''),
      hint: args.scanHint(scan),
      href: args.reportHref(scan),
      ltr: true,
    })),
  ]
}

/** The items whose label contains every word of the query, at most `most` of each group; all, with none. */
export function filterPalette(
  items: readonly PaletteItem[],
  query: string,
  most = 6,
): PaletteItem[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const kept: PaletteItem[] = []
  const counts: Record<PaletteGroup, number> = { pages: 0, sites: 0, scans: 0 }
  for (const item of items) {
    const hay = item.label.toLowerCase()
    if (!terms.every((term) => hay.includes(term))) continue
    if (counts[item.group] >= most) continue
    counts[item.group]++
    kept.push(item)
  }
  return kept
}

// ---------------------------------------------------------------------------------------------
// The scans page

export const PAGE_SIZE = 10

export type ScanStateFilter = 'all' | ScanState

export interface ScanFilter {
  readonly q: string
  readonly state: ScanStateFilter
  readonly siteId: string
}

export const NO_FILTER: ScanFilter = { q: '', state: 'all', siteId: 'all' }

export function filterScans(scans: readonly AccountScan[], filter: ScanFilter): AccountScan[] {
  const terms = filter.q.toLowerCase().split(/\s+/).filter(Boolean)
  return scans.filter((scan) => {
    if (filter.state !== 'all' && scan.state !== filter.state) return false
    if (filter.siteId !== 'all' && scan.siteId !== filter.siteId) return false
    const hay = scan.url.toLowerCase()
    return terms.every((term) => hay.includes(term))
  })
}

export interface Paged<T> {
  readonly items: readonly T[]
  readonly page: number
  readonly pages: number
  /** 1-based, for «11 to 20 of 34»; 0 and 0 for none. */
  readonly from: number
  readonly to: number
  readonly total: number
}

export function paged<T>(items: readonly T[], page: number, size = PAGE_SIZE): Paged<T> {
  const pages = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(Math.max(1, page), pages)
  const start = (current - 1) * size
  const slice = items.slice(start, start + size)
  return {
    items: slice,
    page: current,
    pages,
    from: slice.length === 0 ? 0 : start + 1,
    to: start + slice.length,
    total: items.length,
  }
}

// ---------------------------------------------------------------------------------------------
// Time

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86_400],
  ['month', 30 * 86_400],
  ['week', 7 * 86_400],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
]

/** «yesterday», «3 days ago», «in 2 hours», in the page's language with Western digits. */
export function ago(iso: string, now: number, lang: Lang): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const seconds = Math.round((then - now) / 1000)
  const format = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', {
    numeric: 'auto',
  })
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit)
  }
  return format.format(0, 'second')
}

/** A person's first name for a greeting: the name's first word, or null for none. */
export function firstName(name: string): string | null {
  const first = name.trim().split(/\s+/)[0]
  return first === undefined || first === '' ? null : first
}
