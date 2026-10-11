import { headerValues, type PageFacts } from '@arablyzer/collectors'
import {
  entries,
  isEmpty,
  objectsIn,
  parsedBlocks,
  placeProblems,
  shown,
  type Problem,
} from '../../lib/jsonld-objects'
import { defineRule, type DetectorFinding } from '../../rule'

const MESSAGES = ['not-iso', 'modified-before-published', 'header-invalid'] as const
type Message = (typeof MESSAGES)[number]

/** The meta tags that give a page's dates, and what each date is. */
const META_DATES: ReadonlyMap<string, 'published' | 'modified' | 'other'> = new Map([
  ['article:published_time', 'published'],
  ['article:modified_time', 'modified'],
  ['og:updated_time', 'modified'],
  ['og:published_time', 'published'],
  ['date', 'published'],
  ['dcterms.date', 'published'],
  ['dcterms.created', 'published'],
  ['dcterms.modified', 'modified'],
  ['last-modified', 'modified'],
])

/** The JSON-LD properties that give a date. */
const LD_DATES: ReadonlyMap<string, 'published' | 'modified' | 'other'> = new Map([
  ['datePublished', 'published'],
  ['dateCreated', 'published'],
  ['dateModified', 'modified'],
  ['priceValidUntil', 'other'],
  ['validThrough', 'other'],
  ['validFrom', 'other'],
])

/** ISO 8601 as Google reads dates: a day, or a day and time with an optional offset. */
const ISO =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$/

/** The day an ISO date names as a number that sorts (20261011), or null if it is no date. */
export function isoDay(value: string): number | null {
  const match = ISO.exec(value.trim())
  if (match === null) return null
  const [year, month, day, hour = 0, minute = 0, second = 0] = match.slice(1).map(Number)
  if (year === undefined || month === undefined || day === undefined) return null
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null
  const daysIn = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (day < 1 || day > daysIn) return null
  return year * 10000 + month * 100 + day
}

/** An HTTP-date (RFC 9110): "Sun, 11 Oct 2026 08:00:00 GMT". */
const HTTP_DATE =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/

interface Stated {
  readonly kind: 'published' | 'modified' | 'other'
  readonly value: string
}

/**
 * M6.1: the dates a page states about itself, in its meta tags, its JSON-LD and its Last-Modified
 * header, are dates a machine can read: ISO 8601 (2026-10-11 or 2026-10-11T08:00:00+03:00), not
 * «١١‏/١٠‏/٢٠٢٦» or «11 أكتوبر 2026»; a page is not modified before it was published; the header is an
 * HTTP date. Whether a date is old or new is not judged: nothing here says how fresh a page should
 * be.
 */
export const rule = defineRule({
  id: 'freshness-date-invalid',
  version: '1.0.0',
  category: 'onpage',
  severity: 'moderate',
  needs: ['html', 'headers'],
  messages: MESSAGES,
  appliesTo: (page) =>
    metaDates(page).length > 0 ||
    ldDates(page).length > 0 ||
    headerValues(page.headers, 'last-modified').length > 0,
  detect: ({ page }): DetectorFinding<Message>[] => {
    const findings: DetectorFinding<Message>[] = []
    const stated: Stated[] = []
    for (const meta of metaDates(page)) {
      const value = (meta.content ?? '').trim()
      stated.push({ kind: meta.kind, value })
      if (isoDay(value) === null) {
        findings.push({
          message: 'not-iso',
          values: { source: meta.name, value },
          selector: meta.selector,
          ...(meta.snippet === null ? {} : { snippet: meta.snippet }),
          ...(meta.location === null ? {} : { location: meta.location }),
          key: `meta:${meta.name}`,
        })
      }
    }
    const fromLd = ldDates(page)
    const placed = placeProblems(
      fromLd.flatMap((date): Problem<Message>[] =>
        isoDay(date.value) === null
          ? [
              {
                message: 'not-iso',
                at: date.at,
                values: { source: date.property, value: shown(date.value) },
              },
            ]
          : [],
      ),
    )
    findings.push(...placed)
    for (const date of fromLd) stated.push({ kind: date.kind, value: date.value })
    const published = stated.filter((s) => s.kind === 'published').map((s) => isoDay(s.value))
    const modified = stated.filter((s) => s.kind === 'modified').map((s) => isoDay(s.value))
    const firstPublished = published.filter((day): day is number => day !== null).sort()[0]
    const lastModified = modified
      .filter((day): day is number => day !== null)
      .sort()
      .at(-1)
    if (
      firstPublished !== undefined &&
      lastModified !== undefined &&
      lastModified < firstPublished
    ) {
      findings.push({
        message: 'modified-before-published',
        values: { published: firstPublished, modified: lastModified },
        key: 'order',
      })
    }
    for (const value of headerValues(page.headers, 'last-modified')) {
      if (!HTTP_DATE.test(value.trim())) {
        findings.push({
          message: 'header-invalid',
          values: { value: value.slice(0, 80) },
          snippet: `Last-Modified: ${value}`.slice(0, 200),
          key: `header:${value}`,
        })
      }
    }
    return findings
  },
})

function metaDates(page: PageFacts) {
  return (page.html?.metas ?? []).flatMap((meta) => {
    const name = (meta.property ?? meta.name ?? '').toLowerCase()
    const kind = META_DATES.get(name)
    return kind === undefined || meta.content === null || meta.content.trim() === ''
      ? []
      : [{ ...meta, name, kind }]
  })
}

function ldDates(page: PageFacts) {
  return [...objectsIn(parsedBlocks(page))].flatMap((object) =>
    [...LD_DATES].flatMap(([property, kind]) =>
      entries(object, property).flatMap((at) =>
        typeof at.value === 'string' && !isEmpty(at.value)
          ? [{ at, property, kind, value: at.value.trim() }]
          : [],
      ),
    ),
  )
}
