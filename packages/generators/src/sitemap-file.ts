import { isW3cDate } from '@arablyzer/rules/w3c-date'
import { escapeHtml } from './html'

// The sitemap generator and the sitemap comparer (M10.1): the sitemaps protocol's XML written from
// a list of addresses, and read back from a pasted file. The protocol's limits are its own
// (sitemaps.org): 50,000 addresses to a file, all on one host.

export const MAX_SITEMAP_URLS = 50_000
export const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9'

export type SitemapSkip = 'not-url' | 'other-host' | 'duplicate' | 'bad-date' | 'too-many'

export interface SitemapFileResult {
  readonly xml: string
  readonly count: number
  readonly skipped: readonly {
    readonly line: number
    readonly text: string
    readonly reason: SitemapSkip
  }[]
}

const toLatin = (text: string) =>
  text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))

/**
 * One address to a line, then, if you like, a date (the page's last change): `https://a.com/x 2026-03-05`.
 * Lines with a comma or a tab between the two are read the same.
 */
export function sitemapXml(input: string): SitemapFileResult {
  const skipped: { line: number; text: string; reason: SitemapSkip }[] = []
  const seen = new Set<string>()
  const entries: { loc: string; lastmod: string | null }[] = []
  let host: string | null = null
  input.split(/\r?\n/).forEach((raw, index) => {
    const text = raw.trim()
    if (text === '') return
    const line = index + 1
    const [first = '', second] = text.split(/[\s,]+/, 2)
    let url: URL
    try {
      url = new URL(first)
      if (!/^https?:$/.test(url.protocol)) throw new TypeError('scheme')
    } catch {
      skipped.push({ line, text, reason: 'not-url' })
      return
    }
    let lastmod: string | null = null
    if (second !== undefined && second !== '') {
      const date = toLatin(second)
      if (!isW3cDate(date)) {
        skipped.push({ line, text, reason: 'bad-date' })
        return
      }
      lastmod = date
    }
    url.hash = ''
    host ??= url.host
    if (url.host !== host) {
      skipped.push({ line, text, reason: 'other-host' })
      return
    }
    if (seen.has(url.href)) {
      skipped.push({ line, text, reason: 'duplicate' })
      return
    }
    if (entries.length >= MAX_SITEMAP_URLS) {
      skipped.push({ line, text, reason: 'too-many' })
      return
    }
    seen.add(url.href)
    entries.push({ loc: url.href, lastmod })
  })
  const body = entries
    .map(({ loc, lastmod }) =>
      lastmod === null
        ? `  <url>\n    <loc>${escapeHtml(loc)}</loc>\n  </url>`
        : `  <url>\n    <loc>${escapeHtml(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`,
    )
    .join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SITEMAP_NAMESPACE}">\n${body}${body === '' ? '' : '\n'}</urlset>\n`
  return { xml, count: entries.length, skipped }
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function unescapeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, name: string) => {
      if (name.startsWith('#')) {
        const code =
          name[1]?.toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
        return Number.isInteger(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : whole
      }
      return ENTITIES[name.toLowerCase()] ?? whole
    })
}

export interface SitemapRead {
  /** `null` for a body that is no sitemap. */
  readonly kind: 'urlset' | 'sitemapindex' | null
  /** Each address with its lastmod, in order; the same address twice keeps its first. */
  readonly entries: ReadonlyMap<string, string | null>
}

/** A sitemap's addresses and dates, read with a pattern: the protocol's files are flat, and nothing in them is run. */
export function readSitemap(xml: string): SitemapRead {
  const kind = /<(?:\w+:)?urlset\b/.test(xml)
    ? 'urlset'
    : /<(?:\w+:)?sitemapindex\b/.test(xml)
      ? 'sitemapindex'
      : null
  const entries = new Map<string, string | null>()
  if (kind === null) return { kind, entries }
  const tag = kind === 'urlset' ? 'url' : 'sitemap'
  for (const block of xml.matchAll(
    new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'g'),
  )) {
    const inner = block[1] ?? ''
    const loc = /<(?:\w+:)?loc\b[^>]*>([\s\S]*?)<\/(?:\w+:)?loc>/.exec(inner)?.[1]
    if (loc === undefined) continue
    const lastmod = /<(?:\w+:)?lastmod\b[^>]*>([\s\S]*?)<\/(?:\w+:)?lastmod>/.exec(inner)?.[1]
    let address = unescapeXml(loc).trim()
    try {
      address = new URL(address).href
    } catch {
      // Kept as written: the comparison is of text.
    }
    if (!entries.has(address))
      entries.set(address, lastmod === undefined ? null : unescapeXml(lastmod).trim())
  }
  return { kind, entries }
}

export interface SitemapDiff {
  readonly added: readonly string[]
  readonly removed: readonly string[]
  readonly changed: readonly {
    readonly url: string
    readonly before: string | null
    readonly after: string | null
  }[]
  readonly unchanged: number
}

export function diffSitemaps(before: SitemapRead, after: SitemapRead): SitemapDiff {
  const added = [...after.entries.keys()].filter((url) => !before.entries.has(url))
  const removed = [...before.entries.keys()].filter((url) => !after.entries.has(url))
  const changed: { url: string; before: string | null; after: string | null }[] = []
  let unchanged = 0
  for (const [url, was] of before.entries) {
    if (!after.entries.has(url)) continue
    const now = after.entries.get(url) ?? null
    if (now === was) unchanged++
    else changed.push({ url, before: was, after: now })
  }
  return { added, removed, changed, unchanged }
}
