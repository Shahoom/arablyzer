import sax, { type Tag } from 'sax'
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

/**
 * How deep a sitemap's elements nest before the reader stops. A sitemap's are five deep at most
 * (Google's news extension: `urlset`, `url`, `news`, `publication`, `name`); XML parsers bound
 * this too (libxml2 stops at 256).
 */
export const SITEMAP_MAX_DEPTH = 32

/**
 * How many attributes one element may have before the reader stops, namespace declarations
 * included. A sitemap's root has a dozen at most.
 */
export const SITEMAP_MAX_ATTRIBUTES = 256

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
  /**
   * XML a reader stops at: where the first error is, or where it went past a limit (nesting,
   * attributes on one element, the length of one name or value).
   */
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
  /**
   * A gzip file (`sitemap.xml.gz`) that will not decompress: the site's own fault, which Search
   * Console reports as a compression error.
   */
  | { readonly kind: 'compression' }

/**
 * A sitemap the scan asked for: the URL, whether robots.txt names it, and what came of it (M2.3c).
 * Each is an outcome of its own, so one that could not be checked leaves the others' verdicts.
 */
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
  /** The site says it is not there, or cannot be had: an error status, after any redirects. */
  | {
      readonly outcome: 'unavailable'
      readonly url: string
      readonly named: boolean
      readonly status: number
    }
  /**
   * Arablyzer could not check it, which says nothing of the sitemap. `code`: an @arablyzer/egress
   * error code (no answer in time, an address the scan does not reach, ...), or `opted-out` (the
   * robots.txt of the sitemap's site keeps the bot from it), `bot-challenge`, or `refused` (the
   * site turns the scan away, or cannot answer: see isSitemapRefusal), with `status`.
   */
  | {
      readonly outcome: 'failed'
      readonly url: string
      readonly named: boolean
      readonly code: string
      readonly status?: number
    }

/**
 * A site's sitemaps as a scan found them (M2.3c): robots.txt's Sitemap lines, and what the
 * sitemaps they name answered, or /sitemap.xml's answer when they name none.
 */
export interface SitemapFacts {
  /** Every Sitemap line of robots.txt, in order, a full URL or not. */
  readonly named: readonly RobotsSitemap[]
  /**
   * What the scan asked for, in order: the first sitemaps named as full URLs, or /sitemap.xml.
   * Never empty, but for a robots.txt that could not be read, when the facts are not made.
   */
  readonly checked: readonly SitemapCheck[]
  /** Sitemaps named as full URLs past the scan's limit, which it did not fetch. */
  readonly unchecked: number
}

export interface SitemapInput {
  readonly url: string
  readonly named: boolean
  readonly status: number
  /**
   * The body, decompressed when the file itself was gzipped; null for a gzip file that would not
   * decompress.
   */
  readonly body: Uint8Array | null
  /** Only its first part was read. */
  readonly truncated: boolean
}

/**
 * Whether a status is a site turning the scan away, or unable to answer, rather than saying the
 * file is not there: 401, 403, 407 and 429, which the report page calls refusals (and a scan of
 * a page they answer is shown as blocked), and a server error, which RFC 9309 §2.3.1.4 has a
 * crawler treat as an unreachable robots.txt, not a missing one. A sitemap that answers so has not
 * been checked; one that answers 404 or 410, or with an HTML page, has been.
 */
export function isSitemapRefusal(status: number): boolean {
  return status === 401 || status === 403 || status === 407 || status === 429 || status >= 500
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
  if (isSitemapRefusal(status)) return { outcome: 'failed', url, named, code: 'refused', status }
  if (status < 200 || status > 299) return { outcome: 'unavailable', url, named, status }
  if (input.body === null) {
    return {
      outcome: 'fetched',
      url,
      named,
      status,
      content: { kind: 'compression' },
      truncated: false,
    }
  }
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
 * to the cut. It runs on the scanner's event loop, on a file the site chose: what it reads stays
 * in time and space linear in the body, whatever the body holds (M2.3c review), and it never
 * throws.
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

/**
 * A text sitemap: each line that is not blank is a full URL (sitemaps.org, "Text file"). The lines
 * are walked, not split: a body of millions of blank lines is not held as an array of them.
 */
function readText(text: string, truncated: boolean): SitemapContent {
  let entries = 0
  let number = 0
  let start = 0
  // The next line break of each kind, searched for when the last one is behind: a search that
  // finds none would otherwise run to the end of the text for every line.
  let cr = text.indexOf('\r')
  let lf = text.indexOf('\n')
  for (;;) {
    number++
    if (cr !== -1 && cr < start) cr = text.indexOf('\r', start)
    if (lf !== -1 && lf < start) lf = text.indexOf('\n', start)
    const last = cr === -1 && lf === -1
    const end = last ? text.length : cr === -1 ? lf : lf === -1 ? cr : Math.min(cr, lf)
    // The line the cut ends in is not whole: it is not judged.
    if (!(last && truncated)) {
      const line = trimmed(text, start, end)
      if (line !== '') {
        if (sitemapUrl(line) === null) return { kind: 'text', line: number }
        entries++
      }
    }
    if (last) break
    // A carriage return and a line feed together are one break.
    start = text.charCodeAt(end) === 13 && text.charCodeAt(end + 1) === 10 ? end + 2 : end + 1
  }
  return { kind: 'sitemap', format: 'text', entries: truncated && entries === 0 ? null : entries }
}

/** The part of a line from `start` to `end` without the tabs and spaces at either end. */
function trimmed(text: string, start: number, end: number): string {
  let from = start
  let to = end
  while (from < to && isBlank(text.charCodeAt(from))) from++
  while (to > from && isBlank(text.charCodeAt(to - 1))) to--
  return from === to ? '' : text.slice(from, to)
}

const isBlank = (code: number): boolean => code === 0x20 || code === 0x09

/** Thrown from sax's handlers to stop where reading ends: at an error of the XML, or a limit. */
class Stop extends Error {
  readonly line: number
  readonly column: number

  constructor(line: number, column: number) {
    super('stop')
    this.line = line
    this.column = column
  }
}

/**
 * How much text sax is given at a time. It checks the size of the names, values and comments it
 * holds once per write, so a body written whole is checked once, at its end, after a value of
 * gigabytes could have grown.
 */
const CHUNK_LENGTH = 64 * 1024

/** The namespace of the `xml` prefix, which is bound without a declaration. */
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace'

/** The namespaces an element declares: prefix → namespace, with '' for the default one. */
type Declarations = ReadonlyMap<string, string>

/** The root element as the reader keeps it: its name as written, and what it resolves to. */
interface Root {
  readonly name: string
  readonly local: string
  readonly uri: string
  /** The `version` attribute, which tells an RSS 2.0 feed. */
  readonly version: string | undefined
}

/** What the XML reader has seen: set from sax's handlers. */
interface XmlState {
  root: Root | null
  entries: number
  /** The attributes the element being read has so far. */
  attributes: number
  /** What each open element declares, outermost first: null for an element that declares none. */
  readonly scopes: (Declarations | null)[]
}

/**
 * XML, with sax in strict mode: only XML's own entities, and one root element. It stops at the
 * first error, and at a limit: elements nested deeper than SITEMAP_MAX_DEPTH, more than
 * SITEMAP_MAX_ATTRIBUTES on one element, a name or value that sax will not hold. Namespaces are
 * resolved here and not by sax (`xmlns` off), whose namespace mode slows quadratically with the
 * attributes and the declarations it reads (measured: 160,000 attributes took 7 s, 40,000 nested
 * declarations 26 s); with the limits, the work stays linear in the body.
 */
function readXml(text: string, truncated: boolean): SitemapContent {
  const parser = sax.parser(true, { xmlns: false, position: true, strictEntities: true })
  const state: XmlState = { root: null, entries: 0, attributes: 0, scopes: [] }
  const stop = () => new Stop(parser.line, parser.column)
  parser.onopentagstart = () => {
    state.attributes = 0
  }
  parser.onattribute = () => {
    if (++state.attributes > SITEMAP_MAX_ATTRIBUTES) throw stop()
  }
  parser.onopentag = (tag) => {
    const { scopes, root } = state
    const depth = scopes.length
    // One root element, and nothing after it.
    if (depth === 0 && root !== null) throw stop()
    if (depth >= SITEMAP_MAX_DEPTH) throw stop()
    scopes.push(declarations(tag))
    const named = qualified(tag.name, scopes)
    if (named === null || !attributesBound(tag, scopes)) throw stop()
    if (root === null) {
      state.root = { name: tag.name, ...named, version: tag.attributes.version }
    } else if (depth === 1 && isEntry(root, named)) {
      state.entries++
    }
  }
  parser.onclosetag = () => {
    state.scopes.pop()
  }
  parser.onerror = () => {
    throw stop()
  }
  let stopped: Stop | null = null
  try {
    for (let offset = 0; offset < text.length;) {
      let end = Math.min(offset + CHUNK_LENGTH, text.length)
      // Not between the two halves of a character outside the Basic Multilingual Plane.
      const code = text.charCodeAt(end - 1)
      if (end < text.length && code >= 0xd800 && code <= 0xdbff) end++
      parser.write(text.slice(offset, end))
      offset = end
    }
    if (!truncated) parser.close()
  } catch (error) {
    // A Stop, or sax failing on input it was not made for (an attribute named like a method of
    // Object, say): either way, this is not a file a search engine reads.
    stopped = error instanceof Stop ? error : stop()
  }
  const { root, entries } = state
  if (root !== null && root.local.toLowerCase() === 'html') return { kind: 'html' }
  if (stopped !== null) {
    return { kind: 'not-xml', line: stopped.line + 1, column: stopped.column + 1 }
  }
  if (root === null) {
    // Nothing but a declaration, comments or instructions, or a body cut before its root.
    return { kind: 'not-xml', line: parser.line + 1, column: parser.column + 1 }
  }
  const { local, uri } = root
  if (local === 'urlset' || local === 'sitemapindex') {
    if (uri !== SITEMAP_NAMESPACE) return { kind: 'namespace', root: local, namespace: uri }
    return { kind: 'sitemap', format: local, entries: truncated && entries === 0 ? null : entries }
  }
  if (local === 'rss' && uri === '' && root.version === '2.0') {
    return { kind: 'sitemap', format: 'rss', entries: null }
  }
  if (local === 'feed' && uri === ATOM_NAMESPACE) {
    return { kind: 'sitemap', format: 'atom', entries: null }
  }
  return { kind: 'root', root: root.name, namespace: uri }
}

/** The namespaces a start tag declares: `xmlns` for the default one, `xmlns:prefix` for others. */
function declarations(tag: Tag): Declarations | null {
  let found: Map<string, string> | null = null
  for (const name in tag.attributes) {
    if (name !== 'xmlns' && !name.startsWith('xmlns:')) continue
    found ??= new Map()
    found.set(name.slice(6), tag.attributes[name] ?? '')
  }
  return found
}

/**
 * The namespace a prefix is bound to where the element open last is: its own declarations count,
 * then its ancestors', innermost first, at most SITEMAP_MAX_DEPTH of them. `xml` is bound
 * without a declaration; undefined for a prefix that is not bound.
 */
function namespaceOf(prefix: string, scopes: readonly (Declarations | null)[]): string | undefined {
  for (let level = scopes.length - 1; level >= 0; level--) {
    const uri = scopes[level]?.get(prefix)
    if (uri !== undefined) return uri
  }
  return prefix === 'xml' ? XML_NAMESPACE : undefined
}

/**
 * An element's name split at its prefix, and the namespace it is in: none ('') without a prefix
 * or a default one. Null for a prefix that is not bound (XML Namespaces, "Prefix Declared"), which
 * sax's namespace mode reported as an error too.
 */
function qualified(
  name: string,
  scopes: readonly (Declarations | null)[],
): { readonly local: string; readonly uri: string } | null {
  const colon = name.indexOf(':')
  if (colon <= 0) return { local: name, uri: namespaceOf('', scopes) ?? '' }
  const uri = namespaceOf(name.slice(0, colon), scopes) ?? ''
  return uri === '' ? null : { local: name.slice(colon + 1), uri }
}

/** Whether every prefix on the attributes of a start tag is bound; the declarations are not. */
function attributesBound(tag: Tag, scopes: readonly (Declarations | null)[]): boolean {
  for (const name in tag.attributes) {
    const colon = name.indexOf(':')
    if (colon <= 0 || name.startsWith('xmlns:')) continue
    if ((namespaceOf(name.slice(0, colon), scopes) ?? '') === '') return false
  }
  return true
}

/** A `url` of a `urlset`, or a `sitemap` of a `sitemapindex`, in the protocol's namespace. */
function isEntry(root: Root, element: { readonly local: string; readonly uri: string }): boolean {
  if (element.uri !== SITEMAP_NAMESPACE || root.uri !== SITEMAP_NAMESPACE) return false
  return (
    (root.local === 'urlset' && element.local === 'url') ||
    (root.local === 'sitemapindex' && element.local === 'sitemap')
  )
}

/** The addresses a sitemap lists (M4.5): its `loc` elements, and whether it is an index of sitemaps. */
export interface SitemapLocs {
  /** A `sitemapindex`: the addresses are other sitemaps. A text file and a `urlset` list pages. */
  readonly index: boolean
  readonly locs: readonly string[]
  /** There were more than `limit`, or the body was cut. */
  readonly more: boolean
}

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
}

/** A `loc` element's text: CDATA unwrapped, the five entities decoded, whitespace trimmed. */
function locText(raw: string): string {
  const text = raw.trim()
  const unwrapped = text.startsWith('<![CDATA[') && text.endsWith(']]>') ? text.slice(9, -3) : text
  return unwrapped
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => ENTITIES[entity] ?? entity)
    .trim()
}

/**
 * The addresses of a sitemap, for a crawl to start from: a text file's lines, or the `loc` of each
 * `url` (or, in an index, each `sitemap`), up to `limit`. Not a parser of XML: it looks for the
 * `<loc>` elements the way a crawler that wants addresses does, one scan along the body, linear
 * in its size, and never throws. A feed's entries are not read. Prefixed names (`<s:loc>`) are
 * not either; the protocol's own are.
 */
export function readSitemapLocs(body: Uint8Array, truncated: boolean, limit: number): SitemapLocs {
  const text = new TextDecoder('utf-8').decode(body, { stream: truncated })
  const start = text.search(/[^\t\n\r ]/)
  if (start === -1) return { index: false, locs: [], more: false }
  const locs: string[] = []
  if (text.charAt(start) !== '<') {
    // The lines are walked, not split: a body of millions of blank lines is not held as an array.
    for (let from = start; from < text.length;) {
      let end = text.length
      for (let at = from; at < text.length; at++) {
        const code = text.charCodeAt(at)
        if (code === 10 || code === 13) {
          end = at
          break
        }
      }
      const address = text.slice(from, end).trim()
      from = end + 1
      if (address === '' || sitemapUrl(address) === null) continue
      if (locs.length >= limit) return { index: false, locs, more: true }
      locs.push(address)
    }
    return { index: false, locs, more: truncated }
  }
  const index = /<sitemapindex[\s>]/.test(text.slice(start, start + 2_000))
  for (let at = text.indexOf('<loc>'); at !== -1; at = text.indexOf('<loc>', at)) {
    const end = text.indexOf('</loc>', at + 5)
    if (end === -1) return { index, locs, more: true }
    const address = locText(text.slice(at + 5, end))
    at = end + 6
    if (address === '' || sitemapUrl(address) === null) continue
    if (locs.length >= limit) return { index, locs, more: true }
    locs.push(address)
  }
  return { index, locs, more: truncated }
}
