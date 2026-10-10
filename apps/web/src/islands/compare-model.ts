import {
  CHANGE_KINDS,
  COMPARE_PAGE_PATH,
  type AccountScan,
  type CrawlComparison,
  type ScanComparison,
  type ScoreChange,
  type SiteHistory,
} from '@arablyzer/api-contract/codes'
import { localePath, type Lang } from '@arablyzer/seo/site'

// What the comparison page and the score history need on the page's side (M4.6): the link to a
// comparison and the query that opens one, which scan is the previous one, and the guards of the
// API's answers.

export type CompareType = 'scan' | 'crawl'
/** A scan's or a crawl's id: 22 letters, digits, `_` and `-`. */
const ID = /^[A-Za-z0-9_-]{22}$/

export function compareHref(lang: Lang, type: CompareType, base: string, head: string): string {
  const query = new URLSearchParams({ type, base, head })
  return `${localePath(lang, COMPARE_PAGE_PATH)}?${query.toString()}`
}

/** The comparison a page address asks for; null for anything that is not two ids. */
export function readQuery(
  search: string,
): { readonly type: CompareType; readonly base: string; readonly head: string } | null {
  const query = new URLSearchParams(search)
  const type = query.get('type')
  const base = query.get('base') ?? ''
  const head = query.get('head') ?? ''
  if ((type !== 'scan' && type !== 'crawl') || !ID.test(base) || !ID.test(head) || base === head) {
    return null
  }
  return { type, base, head }
}

const reached = (scan: AccountScan): boolean =>
  (scan.state === 'complete' || scan.state === 'partial') && scan.score !== null

/**
 * The scan to compare the one at `index` with, in a history that lists the newest first: the next
 * older scan of the same address that reached the page. Null when this scan did not, or none is.
 */
export function previousScanOf(scans: readonly AccountScan[], index: number): AccountScan | null {
  const scan = scans[index]
  if (scan === undefined || !reached(scan)) return null
  return scans.slice(index + 1).find((older) => older.url === scan.url && reached(older)) ?? null
}

/** «+5», «−3», «0», with Western digits and a real minus sign; a dash for none. */
export function signed(change: number | null): string {
  if (change === null) return '–'
  if (change === 0) return '0'
  return `${change > 0 ? '+' : '−'}${String(Math.abs(change))}`
}

export type Tone = 'better' | 'worse' | 'same' | 'none'
export const toneOf = (change: ScoreChange): Tone =>
  change.change === null
    ? 'none'
    : change.change > 0
      ? 'better'
      : change.change < 0
        ? 'worse'
        : 'same'

/** A day without a year, for a chart's axis, in the page's language with Western digits. */
export function shortDay(time: number, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(time))
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
const isText = (value: unknown): value is string => typeof value === 'string'
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
const isScore = (value: unknown): boolean => value === null || typeof value === 'number'
const isChange = (value: unknown): value is ScoreChange =>
  isObject(value) && isScore(value.before) && isScore(value.after) && isScore(value.change)
const isLocalized = (value: unknown): boolean =>
  isObject(value) && isText(value.ar) && isText(value.en)
const everyOf = (value: unknown, guard: (item: unknown) => boolean): boolean =>
  Array.isArray(value) && (value as unknown[]).every(guard)
const hasCounts = (value: unknown): boolean =>
  isObject(value) && CHANGE_KINDS.every((kind) => isCount(value[kind]))
const isKind = (value: unknown): boolean =>
  isText(value) && (CHANGE_KINDS as readonly string[]).includes(value)

const isCompared = (value: unknown): boolean =>
  isObject(value) && isText(value.id) && isText(value.url) && isText(value.createdAt)

export function isScanComparison(value: unknown): value is ScanComparison {
  return (
    isObject(value) &&
    isCompared(value.base) &&
    isCompared(value.head) &&
    isChange(value.overall) &&
    everyOf(
      value.categories,
      (item) => isObject(item) && isText(item.category) && isChange(item),
    ) &&
    everyOf(value.engines, (item) => isObject(item) && isText(item.engine)) &&
    typeof value.sameRules === 'boolean' &&
    hasCounts(value.counts) &&
    everyOf(
      value.changes,
      (item) =>
        isObject(item) &&
        isKind(item.kind) &&
        isText(item.ruleId) &&
        isText(item.severity) &&
        isLocalized(item.message) &&
        Array.isArray(item.engines),
    ) &&
    isCount(value.omitted)
  )
}

const isShare = (value: unknown): boolean =>
  value === null || (isObject(value) && isCount(value.pages) && isCount(value.checked))

export function isCrawlComparison(value: unknown): value is CrawlComparison {
  return (
    isObject(value) &&
    isObject(value.base) &&
    isText(value.base.id) &&
    isText(value.base.origin) &&
    isObject(value.head) &&
    isText(value.head.id) &&
    isChange(value.score) &&
    everyOf(
      value.templates,
      (item) => isObject(item) && isText(item.pattern) && isText(item.kind) && isChange(item.score),
    ) &&
    hasCounts(value.counts) &&
    everyOf(
      value.changes,
      (item) =>
        isObject(item) &&
        isKind(item.kind) &&
        isText(item.ruleId) &&
        isText(item.severity) &&
        isText(item.pattern) &&
        isLocalized(item.title) &&
        typeof item.rendered === 'boolean' &&
        isShare(item.before) &&
        isShare(item.after),
    ) &&
    isCount(value.omitted)
  )
}

export function isSiteHistory(value: unknown): value is SiteHistory {
  return (
    isObject(value) &&
    isText(value.siteId) &&
    isText(value.url) &&
    isCount(value.days) &&
    isText(value.since) &&
    typeof value.alerts === 'boolean' &&
    everyOf(
      value.points,
      (item) =>
        isObject(item) &&
        isText(item.scanId) &&
        isText(item.at) &&
        Number.isFinite(Date.parse(item.at)) &&
        (item.source === 'manual' || item.source === 'monitor') &&
        isScore(item.overall) &&
        isObject(item.categories) &&
        Object.values(item.categories).every(isScore),
    ) &&
    everyOf(
      value.markers,
      (item) =>
        isObject(item) &&
        isText(item.scanId) &&
        isText(item.at) &&
        (item.kind === 'score-drop' || item.kind === 'critical' || item.kind === 'down'),
    )
  )
}
