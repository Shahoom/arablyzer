import { escapeHtml } from './html'
import type { Lang } from './site'

// The blog's feeds (RSS 2.0 and Atom 1.0), one pair for each language. A feed lists what the
// blog's page lists: the article's title, its address, its summary and its dates. Dates are
// YYYY-MM-DD, as the articles carry them, so a feed is the same bytes for the same articles.

export interface FeedEntry {
  readonly title: string
  readonly url: string
  readonly summary: string
  /** YYYY-MM-DD. */
  readonly published: string
  /** YYYY-MM-DD. */
  readonly updated: string
  readonly tags: readonly string[]
  readonly author: string
}

export interface Feed {
  readonly title: string
  readonly description: string
  readonly lang: Lang
  /** The blog's page in this language. */
  readonly siteUrl: string
  /** The feed's own address. */
  readonly feedUrl: string
  /** The other format's address, for `rel="alternate"` in the feed. */
  readonly entries: readonly FeedEntry[]
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parse(iso: string): Date {
  const match = DATE.exec(iso)
  const date = new Date(`${iso}T00:00:00Z`)
  if (match === null || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    throw new TypeError(`Not a YYYY-MM-DD date: ${iso}`)
  }
  return date
}

/** YYYY-MM-DD → "Sat, 10 Oct 2026 00:00:00 GMT" (RFC 822, as RSS dates are). */
export function rfc822(iso: string): string {
  const date = parse(iso)
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${DAYS[date.getUTCDay()] ?? ''}, ${day} ${MONTHS[date.getUTCMonth()] ?? ''} ${date.getUTCFullYear()} 00:00:00 GMT`
}

/** YYYY-MM-DD → "2026-10-10T00:00:00Z" (RFC 3339, as Atom dates are). */
export function rfc3339(iso: string): string {
  return `${parse(iso).toISOString().slice(0, 19)}Z`
}

/** The newest date a feed holds: its own date. A feed with no entries has no date. */
function newest(entries: readonly FeedEntry[]): string | undefined {
  return entries
    .map((entry) => entry.updated)
    .sort()
    .at(-1)
}

export function rssXml(feed: Feed): string {
  const built = newest(feed.entries)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '<channel>',
    `<title>${escapeHtml(feed.title)}</title>`,
    `<link>${escapeHtml(feed.siteUrl)}</link>`,
    `<description>${escapeHtml(feed.description)}</description>`,
    `<language>${feed.lang}</language>`,
    ...(built === undefined ? [] : [`<lastBuildDate>${rfc822(built)}</lastBuildDate>`]),
    `<atom:link href="${escapeHtml(feed.feedUrl)}" rel="self" type="application/rss+xml"/>`,
    ...feed.entries.flatMap((entry) => [
      '<item>',
      `<title>${escapeHtml(entry.title)}</title>`,
      `<link>${escapeHtml(entry.url)}</link>`,
      `<guid isPermaLink="true">${escapeHtml(entry.url)}</guid>`,
      `<pubDate>${rfc822(entry.published)}</pubDate>`,
      `<dc:creator>${escapeHtml(entry.author)}</dc:creator>`,
      ...entry.tags.map((tag) => `<category>${escapeHtml(tag)}</category>`),
      `<description>${escapeHtml(entry.summary)}</description>`,
      '</item>',
    ]),
    '</channel>',
    '</rss>',
    '',
  ].join('\n')
}

export function atomXml(feed: Feed): string {
  const built = newest(feed.entries)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${feed.lang}">`,
    `<id>${escapeHtml(feed.siteUrl)}</id>`,
    `<title>${escapeHtml(feed.title)}</title>`,
    `<subtitle>${escapeHtml(feed.description)}</subtitle>`,
    `<updated>${built === undefined ? '1970-01-01T00:00:00Z' : rfc3339(built)}</updated>`,
    `<link rel="self" type="application/atom+xml" href="${escapeHtml(feed.feedUrl)}"/>`,
    `<link rel="alternate" type="text/html" href="${escapeHtml(feed.siteUrl)}"/>`,
    ...feed.entries.flatMap((entry) => [
      '<entry>',
      `<id>${escapeHtml(entry.url)}</id>`,
      `<title>${escapeHtml(entry.title)}</title>`,
      `<link rel="alternate" type="text/html" href="${escapeHtml(entry.url)}"/>`,
      `<published>${rfc3339(entry.published)}</published>`,
      `<updated>${rfc3339(entry.updated)}</updated>`,
      `<author><name>${escapeHtml(entry.author)}</name></author>`,
      ...entry.tags.map((tag) => `<category term="${escapeHtml(tag)}"/>`),
      `<summary>${escapeHtml(entry.summary)}</summary>`,
      '</entry>',
    ]),
    '</feed>',
    '',
  ].join('\n')
}
