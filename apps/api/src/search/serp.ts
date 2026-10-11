import {
  SERP_MAX_QUERIES,
  type SerpOutcome,
  type SerpQuery,
  type SerpResponse,
  type SerpResult,
  type SerpRival,
} from '@arablyzer/api-contract/codes'
import { safeFetch, type EgressPolicy, type Resolver } from '@arablyzer/egress'
import { USER_AGENT } from '@arablyzer/engine/identity'
import { DayCache } from './cache'

/**
 * Google's results page, fetched through the egress proxy as ArablyzerBot and read for the organic
 * results' domains alone (top 10). Not an API: Google's terms do not offer the page for automated
 * use, it asks for a check (a consent page, a CAPTCHA, "enable JavaScript") of a client it does not
 * know, and its markup changes. So it is behind ARABLYZER_SERP=1, off by default; at most
 * SERP_MAX_QUERIES queries a request (one scan of the visitor's quota), one at a time with a pause,
 * stopped at the first check Google asks for, the domains kept a day, and no title, snippet or
 * address of a result is kept or shown.
 */
export const SERP_ENDPOINT = 'https://www.google.com/search'
export const SERP_GAP_MS = 2_000
const TIMEOUT_MS = 10_000
const MAX_BYTES = 768 * 1024
const RESULTS = 10

/** The domain suffixes of the Arab League's countries (and Palestine and Western Sahara's .eh). */
export const ARAB_TLDS: ReadonlySet<string> = new Set([
  'sa',
  'ae',
  'eg',
  'kw',
  'qa',
  'bh',
  'om',
  'jo',
  'lb',
  'iq',
  'sy',
  'ye',
  'ly',
  'tn',
  'dz',
  'ma',
  'sd',
  'ps',
  'mr',
  'so',
  'dj',
  'km',
  'eh',
])

/** Hosts that are Google's own pages or tools, never an organic result. */
const GOOGLE_HOST =
  /(^|\.)(google\.[a-z.]+|googleusercontent\.com|googleapis\.com|gstatic\.com|youtube\.com|goo\.gl|g\.co|blogger\.com|webcache\.googleusercontent\.com)$/

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
}
const decode = (text: string): string =>
  text.replace(/&(?:amp|quot|#39|lt|gt);/g, (entity) => ENTITIES[entity] ?? entity)
const stripTags = (html: string): string =>
  decode(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()

/** The host name of an address as a domain: lower case, no `www.`, no port; null for a non-address. */
export function domainOf(address: string): string | null {
  try {
    const url = new URL(address)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    const host = url.hostname
      .toLowerCase()
      .replace(/\.$/, '')
      .replace(/^www\./, '')
    return host.includes('.') ? host : null
  } catch {
    return null
  }
}

/** A domain the visitor typed (an address or a bare name), folded the same way; null if it is not. */
export function cleanDomain(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const typed = input.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  const host = typed.split(/[/?#]/, 1)[0] ?? ''
  if (host === '' || host.includes('@') || host.includes(':')) return null
  const domain = domainOf(`https://${host}/`)
  return domain !== null && /^[a-z0-9.-]+$/.test(domain) ? domain : null
}

/** Whether a result's domain is the visitor's: the same name or a subdomain of it. */
export const isSameSite = (domain: string, yours: string): boolean =>
  domain === yours || domain.endsWith(`.${yours}`)

const ARABIC_LETTER = /(?=\p{L})\p{Script=Arabic}/gu
const ANY_LETTER = /\p{L}/gu

/** Whether most of a title's letters are Arabic. */
export function arabicTitle(title: string): boolean {
  const letters = title.match(ANY_LETTER)?.length ?? 0
  const arabic = title.match(ARABIC_LETTER)?.length ?? 0
  return letters >= 3 && arabic / letters >= 0.5
}

/**
 * Whether a result is an Arabic site, by what the results page itself shows: the title is mostly
 * Arabic letters, or the domain ends in an Arab country's suffix (or is written in Arabic). A
 * `.com` with an English title is not recognised, and the page says so.
 */
export function arabicSite(domain: string, title: string): SerpResult['signals'] {
  const signals: ('title' | 'tld')[] = []
  if (arabicTitle(title)) signals.push('title')
  const tld = domain.split('.').at(-1) ?? ''
  if (ARAB_TLDS.has(tld) || tld.startsWith('xn--')) signals.push('tld')
  return signals
}

/** One organic result as read: its position among them, its domain and its title (not kept). */
interface Organic {
  readonly domain: string
  readonly title: string
}

/**
 * The organic results of a results page, in the order they appear, at most ten, each domain once.
 * Two shapes are read: the lightweight page, whose links go through `/url?q=<address>`, and the
 * full page, whose result links are direct and hold an `<h3>` title. Google's own hosts are not
 * results. A page with neither shape gives none.
 */
export function organicResults(html: string): Organic[] {
  const found: Organic[] = []
  const seen = new Set<string>()
  const take = (address: string, title: string) => {
    const domain = domainOf(decode(address))
    if (domain === null || GOOGLE_HOST.test(domain) || seen.has(domain)) return
    seen.add(domain)
    found.push({ domain, title })
  }
  const anchors = /<a\b[^>]*?\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  for (const match of html.matchAll(anchors)) {
    if (found.length >= RESULTS) break
    const href = match[1] ?? ''
    const inner = match[2] ?? ''
    const heading = /<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(inner)?.[1]
    if (href.startsWith('/url?')) {
      const target = new URLSearchParams(href.slice(5).replace(/&amp;/g, '&')).get('q')
      if (target !== null) take(target, stripTags(heading ?? inner))
    } else if (/^https?:\/\//i.test(href) && heading !== undefined) {
      take(href, stripTags(heading))
    }
  }
  return found
}

/** What a page Google sent says of itself: a check it asks for, instead of results. */
export function isCheckPage(finalUrl: string, html: string): boolean {
  return (
    /\/sorry\/|consent\.google\.|accounts\.google\.com/.test(finalUrl) ||
    /unusual traffic|id="captcha-form"|\/httpservice\/retry\/enablejs|Before you continue to Google/i.test(
      html,
    )
  )
}

export interface SerpDeps {
  readonly policy: EgressPolicy
  readonly resolver?: Resolver
  readonly fetcher?: typeof safeFetch
  /** Another place for Google's results page: tests' stand-in. */
  readonly endpoint?: string
  readonly now: () => number
  readonly sleep?: (ms: number) => Promise<void>
  readonly gapMs?: number
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

interface Kept {
  readonly outcome: SerpOutcome
  readonly results: readonly SerpResult[]
}

/** The sampler: queries to the organic domains of Google's results, cached a day. */
export function serpSampler(deps: SerpDeps) {
  const cache = new DayCache<Kept>(deps.now)

  const fetchPage = async (query: string): Promise<Kept> => {
    const url = new URL(deps.endpoint ?? SERP_ENDPOINT)
    url.searchParams.set('q', query)
    url.searchParams.set('hl', 'ar')
    url.searchParams.set('num', String(RESULTS))
    url.searchParams.set('pws', '0')
    try {
      const fetched = await (deps.fetcher ?? safeFetch)(url.href, {
        userAgent: USER_AGENT,
        accept: 'text/html',
        policy: deps.policy,
        ...(deps.resolver === undefined ? {} : { resolver: deps.resolver }),
        timeoutMs: TIMEOUT_MS,
        maxBytes: MAX_BYTES,
        onTooLarge: 'truncate',
        headers: { 'accept-language': 'ar,en;q=0.5' },
      })
      const response = fetched.response
      if (response === null) return { outcome: 'failed', results: [] }
      if (response.status === 429 || response.status === 503) {
        return { outcome: 'blocked', results: [] }
      }
      if (response.status !== 200) return { outcome: 'failed', results: [] }
      const html = new TextDecoder().decode(response.body)
      if (isCheckPage(response.url, html)) return { outcome: 'blocked', results: [] }
      const organic = organicResults(html)
      if (organic.length === 0) return { outcome: 'unreadable', results: [] }
      return {
        outcome: 'ok',
        results: organic.map((item, index): SerpResult => {
          const signals = arabicSite(item.domain, item.title)
          return {
            position: index + 1,
            domain: item.domain,
            arabic: signals.length > 0,
            signals,
          }
        }),
      }
    } catch {
      return { outcome: 'failed', results: [] }
    }
  }

  return {
    async run(queries: readonly string[], yours: string | null): Promise<SerpResponse> {
      const out: SerpQuery[] = []
      let asked = 0
      let stopped = false
      for (const query of queries.slice(0, SERP_MAX_QUERIES)) {
        const key = query.normalize('NFC').toLowerCase()
        let kept = cache.get(key)
        if (kept === undefined && stopped) kept = { outcome: 'blocked', results: [] }
        if (kept === undefined) {
          if (asked > 0) await (deps.sleep ?? wait)(deps.gapMs ?? SERP_GAP_MS)
          kept = await fetchPage(query)
          asked++
          // Only a list we read is kept; a check Google asked for ends the asking.
          if (kept.outcome === 'ok') cache.set(key, kept)
          if (kept.outcome === 'blocked') stopped = true
        }
        const you =
          yours === null
            ? null
            : (kept.results.find((result) => isSameSite(result.domain, yours))?.position ?? null)
        out.push({ query, outcome: kept.outcome, results: kept.results, you })
      }
      return { queries: out, rivals: rivalsOf(out, yours), domain: yours }
    },
  }
}

/** The domains in the results of two queries or more (not the visitor's), the most often first. */
export function rivalsOf(queries: readonly SerpQuery[], yours: string | null): SerpRival[] {
  const rivals = new Map<string, { queries: number; best: number; arabic: boolean }>()
  for (const query of queries) {
    for (const result of query.results) {
      if (yours !== null && isSameSite(result.domain, yours)) continue
      const seen = rivals.get(result.domain)
      rivals.set(result.domain, {
        queries: (seen?.queries ?? 0) + 1,
        best: Math.min(seen?.best ?? result.position, result.position),
        arabic: (seen?.arabic ?? false) || result.arabic,
      })
    }
  }
  return [...rivals.entries()]
    .filter(([, rival]) => rival.queries >= 2)
    .map(([domain, rival]): SerpRival => ({ domain, ...rival }))
    .sort((a, b) => b.queries - a.queries || a.best - b.best || a.domain.localeCompare(b.domain))
    .slice(0, 10)
}

export type SerpSampler = ReturnType<typeof serpSampler>
