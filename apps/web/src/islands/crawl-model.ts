import {
  CRAWL_STATES,
  TEMPLATE_KINDS,
  type CrawlIssue,
  type CrawlPage,
  type CrawlPagesResponse,
  type CrawlReport,
  type CrawlState,
  type CrawlSummary,
  type CrawlTemplate,
} from '@arablyzer/api-contract/codes'
import type { CrawlStrings } from '@arablyzer/i18n/crawl'

// What the account page needs to read and show a deep crawl (M4.5): the guards of the API's
// answers, whether a crawl is still going, and the words of a template.

/** How often a crawl that is going is asked about. */
export const POLL_MS = 4_000
/** The issues the table shows before «show all». */
export const ISSUES_SHOWN = 12

const ACTIVE: ReadonlySet<CrawlState> = new Set(['queued', 'running', 'rendering'])
export const isActive = (state: CrawlState): boolean => ACTIVE.has(state)

const SEVERITIES = ['critical', 'serious', 'moderate', 'minor', 'info']
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
const isText = (value: unknown): value is string => typeof value === 'string'
const everyOf = <T>(value: unknown, guard: (item: unknown) => item is T): value is T[] =>
  Array.isArray(value) && (value as unknown[]).every(guard)

export function isCrawlSummary(value: unknown): value is CrawlSummary {
  if (!isObject(value)) return false
  const rendered = value.rendered
  return (
    isText(value.id) &&
    (value.siteId === null || isText(value.siteId)) &&
    isText(value.origin) &&
    isText(value.state) &&
    (CRAWL_STATES as readonly string[]).includes(value.state) &&
    (value.error === null || isText(value.error)) &&
    isCount(value.pagesFound) &&
    isCount(value.pagesChecked) &&
    isCount(value.pageCap) &&
    isCount(value.templates) &&
    isObject(rendered) &&
    isCount(rendered.done) &&
    isCount(rendered.total) &&
    isText(value.createdAt) &&
    (value.finishedAt === null || isText(value.finishedAt))
  )
}

const isLocalized = (value: unknown): boolean =>
  isObject(value) && isText(value.ar) && isText(value.en)

function isRepresentative(value: unknown): boolean {
  return (
    isObject(value) &&
    isText(value.url) &&
    (value.scanId === null || isText(value.scanId)) &&
    (value.state === null || isText(value.state)) &&
    (value.score === null || isCount(value.score))
  )
}

function isTemplate(value: unknown): value is CrawlTemplate {
  return (
    isObject(value) &&
    isText(value.key) &&
    isText(value.kind) &&
    (TEMPLATE_KINDS as readonly string[]).includes(value.kind) &&
    isText(value.pattern) &&
    isCount(value.found) &&
    isCount(value.checked) &&
    everyOf(value.topIssues, isText) &&
    Array.isArray(value.representatives) &&
    (value.representatives as unknown[]).every(isRepresentative)
  )
}

function isIssue(value: unknown): value is CrawlIssue {
  return (
    isObject(value) &&
    isText(value.ruleId) &&
    isText(value.severity) &&
    SEVERITIES.includes(value.severity) &&
    isLocalized(value.title) &&
    typeof value.rendered === 'boolean' &&
    isCount(value.pages) &&
    Array.isArray(value.templates) &&
    (value.templates as unknown[]).every(
      (cell) =>
        isObject(cell) &&
        isText(cell.template) &&
        isCount(cell.pages) &&
        isCount(cell.checked) &&
        everyOf(cell.examples, isText),
    )
  )
}

export function isCrawlReport(value: unknown): value is CrawlReport {
  return (
    isObject(value) &&
    isCrawlSummary(value.crawl) &&
    Array.isArray(value.templates) &&
    (value.templates as unknown[]).every(isTemplate) &&
    Array.isArray(value.issues) &&
    (value.issues as unknown[]).every(isIssue)
  )
}

function isPage(value: unknown): value is CrawlPage {
  return (
    isObject(value) &&
    isText(value.url) &&
    isCount(value.depth) &&
    (value.status === null || isCount(value.status)) &&
    isText(value.state) &&
    (value.template === null || isText(value.template)) &&
    (value.title === null || isText(value.title)) &&
    Array.isArray(value.issues) &&
    (value.issues as unknown[]).every(
      (issue) =>
        isObject(issue) && isText(issue.ruleId) && isText(issue.severity) && isCount(issue.count),
    ) &&
    (value.scanId === null || isText(value.scanId))
  )
}

export function isCrawlPages(value: unknown): value is CrawlPagesResponse {
  return (
    isObject(value) &&
    Array.isArray(value.pages) &&
    (value.pages as unknown[]).every(isPage) &&
    (value.next === null || isCount(value.next))
  )
}

export function isCrawlList(value: unknown): value is { crawls: CrawlSummary[] } {
  return (
    isObject(value) &&
    Array.isArray(value.crawls) &&
    (value.crawls as unknown[]).every(isCrawlSummary)
  )
}

/** A template as a heading names it: its kind in words and the pattern, which is always left to right. */
export function templateName(
  t: CrawlStrings['report'],
  template: Pick<CrawlTemplate, 'kind' | 'pattern'>,
): { readonly kind: string; readonly pattern: string } {
  return {
    kind: t.kinds[template.kind],
    pattern: template.kind === 'standalone' ? t.standalonePattern : template.pattern,
  }
}

/** The same as one line, for a label that reads out. */
export function templateLabel(
  t: CrawlStrings['report'],
  template: Pick<CrawlTemplate, 'kind' | 'pattern'>,
): string {
  const name = templateName(t, template)
  return t.templateName(name.kind, name.pattern)
}

/** The issue's title in the page's language. */
export const issueTitle = (issue: CrawlIssue, lang: 'ar' | 'en'): string => issue.title[lang]

/** The share of the pages checked that an issue is on, 0 to 1, for ordering. */
export const share = (pages: number, checked: number): number =>
  checked === 0 ? 0 : pages / checked
