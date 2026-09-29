import sax, { type QualifiedTag } from 'sax'
import type { RobotsSitemap } from './robots'

/**
 * The namespace of the sitemaps protocol's `urlset` and `sitemapindex` (sitemaps.org), which
 * Search Console asks for as written: http, not https.
 */
export const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9'

/** Atom 1.0's namespace (RFC 4287): Google reads an Atom 1.0 feed as a sitemap. */
export const ATOM_NAMESPACE = 'http://www.w3.org/2005/Atom'

/** The sitemaps robots.txt names that a scan fetches at most: the first ones it names. */
export const SITEMAP_LIMIT = 3

/** The formats Google reads a sitemap in: the protocol's XML, an RSS 2.0 or Atom 1.0 feed, text. */
export type SitemapFormat = 'urlset' | 'sitemapindex' | 'rss' | 'atom' | 'text'

/** What a sitemap's body holds (M2.3c). Lines and columns count from 1. */
export type SitemapContent =
  /**
   * A sitemap in one of the formats. `entries`: the `url` or `sitemap` elements, or the URL lines,
   * in the part read; null for a feed, whose entries are not counted, and for a body cut before
   * its first entry.
   */
  | { readonly kind: 'sitemap'; readonly format: SitemapFormat; readonly entries: number | null }
  /** An HTML page. */
  | { readonly kind: 'html' }
  /** Not well-formed XML: where the first error is. */
  | { readonly kind: 'not-xml'; readonly line: number; readonly column: number }
  /** XML whose root element is no sitemap's or feed's: its name as written, and its namespace. */
  | { readonly kind: 'root'; readonly root: string; readonly namespace: string }
  /** A `urlset` or `sitemapindex` outside the protocol's namespace ('' for none). */
  | {
      readonly kind: 'namespace'
      readonly root: 'urlset' | 'sitemapindex'
      readonly namespace: string
    }
  /** Not XML, and this line is not a full URL, as each line of a text sitemap must be. */
  | { readonly kind: 'text'; readonly line: number }

/** A sitemap the scan fetched: the URL it asked for, and whether robots.txt names it. */
export type SitemapCheck =
  /** It answered 2xx: what it holds, and whether only its first part was read. */
  | {
      readonly outcome: 'fetched'
      readonly url: string
      readonly named: boolean
      readonly status: number
      readonly content: SitemapContent
      readonly truncated: boolean
    }
  /** It answered with another status, after any redirects. */
  | {
      readonly outcome: 'unavailable'
      readonly url: string
      readonly named: boolean
      readonly status: number
    }

/**
 * A site's sitemaps as a scan found them (M2.3c): robots.txt's Sitemap lines, and what the
 * sitemaps they name answered, or /sitemap.xml's answer when they name none.
 */
export interface SitemapFacts {
  /** Every Sitemap line of robots.txt, in order, a full URL or not. */
  readonly named: readonly RobotsSitemap[]
  /** What the scan fetched, in order: the first sitemaps named as full URLs, or /sitemap.xml. */
  readonly checked: readonly SitemapCheck[]
  /** Sitemaps named as full URLs past the scan's limit, which it did not fetch. */
  readonly unchecked: number
}

export interface SitemapInput {
  readonly url: string
  readonly named: boolean
  readonly status: number
  /** The body, decompressed when the file itself was gzipped. */
  readonly body: Uint8Array
  /** Only its first part was read. */
  readonly truncated: boolean
}

/**
 * A sitemap's address as robots.txt or a text sitemap must give it: a full http or https URL,
 * which need not be percent-encoded (Google's robots.txt specification). Null for anything else,
 * a relative path among them; a URL with spaces is not one as written.
 */
export function sitemapUrl(value: string): string | null {
  if (/\s/.test(value)) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/**
 * What to fetch for a site's sitemaps: the distinct full URLs robots.txt names, the first
 * `limit` of them, and how many more there are; /sitemap.xml at the origin when it names none.
 */
export function sitemapTargets(
  named: readonly RobotsSitemap[],
  origin: string,
  limit = SITEMAP_LIMIT,
): { readonly fetch: readonly { url: string; named: boolean }[]; readonly unchecked: number } {
  const urls = [...new Set(named.flatMap((line) => sitemapUrl(line.value) ?? []))]
  if (urls.length === 0)
    return { fetch: [{ url: new URL('/sitemap.xml', origin).href, named: false }], unchecked: 0 }
  return {
    fetch: urls.slice(0, limit).map((url) => ({ url, named: true })),
    unchecked: Math.max(0, urls.length - limit),
  }
}

export function collectSitemap(input: SitemapInput): SitemapCheck {
  const { url, named, status } = input
  if (status < 200 || status > 299) return { outcome: 'unavailable', url, named, status }
  return {
    outcome: 'fetched',
    url,
    named,
    status,
    content: readSitemap(input.body, input.truncated),
    truncated: input.truncated,
  }
}

/**
 * Reads a sitemap's body as Google's formats ask: XML, whose root names the format, or text, one
 * full URL per line. UTF-8, as the protocol asks; a byte order mark and whitespace before the
 * start are allowed, as Search Console allows them. A body cut at the read limit is judged up
 * to the cut.
 */
export function readSitemap(body: Uint8Array, truncated: boolean): SitemapContent {
  // Streaming holds back a character the cut splits, rather than reading it as a broken one.
  const text = new TextDecoder('utf-8').decode(body, { stream: truncated })
  const start = text.search(/[^\t\n\r ]/)
  if (start === -1) return { kind: 'sitemap', format: 'text', entries: truncated ? null : 0 }
  if (text.charAt(start) !== '<') return readText(text, truncated)
  if (/^<!doctype\s+html[\s>]/i.test(text.slice(start, start + 20))) return { kind: 'html' }
  return readXml(text, truncated)
}

/** A text sitemap: each line that is not blank is a full URL (sitemaps.org, "Text file"). */
function readText(text: string, truncated: boolean): SitemapContent {
  const lines = text.split(/\r\n|\r|\n/)
  // The line the cut ends in is not whole: it is not judged.
  const whole = truncated ? lines.length - 1 : lines.length
  let entries = 0
  for (let index = 0; index < whole; index++) {
    const line = (lines[index] ?? '').replace(/^[\t ]+|[\t ]+$/g, '')
    if (line === '') continue
    if (sitemapUrl(line) === null) return { kind: 'text', line: index + 1 }
    entries++
  }
  return { kind: 'sitemap', format: 'text', entries: truncated && entries === 0 ? null : entries }
}

/** Thrown from sax's handlers to stop at the first problem. */
class Stop extends Error {
  readonly line: number
  readonly column: number

  constructor(line: number, column: number) {
    super('stop')
    this.line = line
    this.column = column
  }
}

/** sax's own limit on one attribute, comment or name (64 KiB): its error says nothing of XML. */
const BUFFER_LIMIT = 'Max buffer length exceeded'

/** What the XML reader has seen: set from sax's handlers. */
interface XmlState {
  root: QualifiedTag | null
  depth: number
  entries: number
  /** sax stopped at its own limit, not at an error of the XML. */
  limited: boolean
}

/**
 * XML, with sax in strict mode: namespaces resolved, only XML's own entities, and one root
 * element. It stops at the first error.
 */
function readXml(text: string, truncated: boolean): SitemapContent {
  const parser = sax.parser(true, { xmlns: true, position: true, strictEntities: true })
  const state: XmlState = { root: null, depth: 0, entries: 0, limited: false }
  parser.onopentag = (tag) => {
    if (state.depth === 0 && state.root !== null) throw new Stop(parser.line, parser.column)
    if (state.root === null) state.root = tag
    else if (state.depth === 1 && isEntry(state.root, tag)) state.entries++
    state.depth++
  }
  parser.onclosetag = () => {
    state.depth--
  }
  parser.onerror = (error) => {
    if (error.message.startsWith(BUFFER_LIMIT)) state.limited = true
    throw new Stop(parser.line, parser.column)
  }
  let stop: Stop | null = null
  try {
    parser.write(text)
    if (!truncated) parser.close()
  } catch (error) {
    if (!(error instanceof Stop)) throw error
    stop = error
  }
  const { root, entries, limited } = state
  if (root !== null && root.local.toLowerCase() === 'html') return { kind: 'html' }
  if (stop !== null && !limited) {
    return { kind: 'not-xml', line: stop.line + 1, column: stop.column + 1 }
  }
  if (root === null) {
    // Nothing but a declaration, comments or instructions, or a body cut before its root.
    return { kind: 'not-xml', line: parser.line + 1, column: parser.column + 1 }
  }
  const { local, uri } = root
  if (local === 'urlset' || local === 'sitemapindex') {
    if (uri !== SITEMAP_NAMESPACE) return { kind: 'namespace', root: local, namespace: uri }
    return {
      kind: 'sitemap',
      format: local,
      entries: (truncated || limited) && entries === 0 ? null : entries,
    }
  }
  if (local === 'rss' && uri === '' && root.attributes.version?.value === '2.0') {
    return { kind: 'sitemap', format: 'rss', entries: null }
  }
  if (local === 'feed' && uri === ATOM_NAMESPACE) {
    return { kind: 'sitemap', format: 'atom', entries: null }
  }
  return { kind: 'root', root: root.name, namespace: uri }
}

/** A `url` of a `urlset`, or a `sitemap` of a `sitemapindex`, in the protocol's namespace. */
function isEntry(root: QualifiedTag, tag: QualifiedTag): boolean {
  if (tag.uri !== SITEMAP_NAMESPACE || root.uri !== SITEMAP_NAMESPACE) return false
  return (
    (root.local === 'urlset' && tag.local === 'url') ||
    (root.local === 'sitemapindex' && tag.local === 'sitemap')
  )
}
