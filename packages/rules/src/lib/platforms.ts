import { readFileSync } from 'node:fs'
import { headerValues, type PageFacts } from '@arablyzer/collectors'

/**
 * Which platform a page runs on, from what its server sent: the CMS or store, the builder, the
 * plugins and the services it loads. The fingerprints are a pinned subset of webappanalyzer's
 * (vendor/webappanalyzer, GPL-3.0), plus Arablyzer's own for Arab platforms. Only what a fetched
 * page shows is read: its headers, cookies, meta tags, script addresses, the addresses in its
 * tags, and its URL. Nothing runs, so a platform that shows itself only in the browser is not seen.
 */
export type PlatformKind = 'platform' | 'builder' | 'plugin' | 'service'

export interface Detected {
  /** Lowercase, kebab-case: the key of platform-specific fix guides. */
  readonly id: string
  readonly name: string
  readonly kind: PlatformKind
  /** null when the page does not say. */
  readonly version: string | null
  /** 1 to 100: the sum of what its markers weigh, at most 100. */
  readonly confidence: number
  /** What was seen, at most 3 lines. */
  readonly evidence: readonly string[]
  /** Arablyzer's own fingerprint, or webappanalyzer's. */
  readonly source: 'arablyzer' | 'webappanalyzer'
}

/** A fingerprint in webappanalyzer's format: patterns are `regex\;version:\1\;confidence:50`. */
export interface Fingerprint {
  readonly cats?: readonly number[]
  readonly headers?: Readonly<Record<string, string | readonly string[]>>
  readonly cookies?: Readonly<Record<string, string | readonly string[]>>
  readonly meta?: Readonly<Record<string, string | readonly string[]>>
  readonly scriptSrc?: string | readonly string[]
  readonly html?: string | readonly string[]
  readonly url?: string | readonly string[]
  readonly implies?: string | readonly string[]
}

interface Vendored {
  readonly commit: string
  readonly techs: Readonly<Record<string, Fingerprint>>
}

/**
 * Arablyzer's own fingerprints, for the Arab platforms the vendored list misses or covers weakly.
 * Each marker was checked against a public page of the platform on 2026-10-04 unless its comment
 * says it was not: the `confidence` of a marker says how much it alone proves.
 */
export const ARAB_FINGERPRINTS: Readonly<Record<string, Fingerprint>> = {
  // Verified: cdn.salla.network serves a store's assets, and `x-powered-by: Salla` is upstream's.
  Salla: {
    cats: [6],
    headers: { 'x-powered-by': String.raw`^Salla$` },
    scriptSrc: [
      String.raw`(?:^|//)cdn\.salla\.network/\;confidence:60`,
      String.raw`\.assets\.salla\.network`,
    ],
    html: [String.raw`<link[^>]+href="https?://cdn\.salla\.network/\;confidence:40`],
  },
  // Verified on demo.zid.store: its cookies, its script paths, its media host.
  Zid: {
    cats: [6],
    cookies: {
      zid_language: String.raw`\;confidence:50`,
      zid_currency: String.raw`\;confidence:50`,
      zid_country: String.raw`\;confidence:50`,
      zid_catalog_session: '',
    },
    scriptSrc: [
      String.raw`/js/script_loader\.js\;confidence:30`,
      String.raw`/js/t_scripts\.[\d.]+js\;confidence:30`,
    ],
    html: [String.raw`<link[^>]+href="https?://media\.zid\.store/\;confidence:40`],
  },
  // Verified on store.youcan.shop: the request id header and the platform's x-powered-by.
  YouCan: {
    cats: [6],
    headers: {
      'x-youcan-request-id': '',
      'x-powered-by': String.raw`Youcan\.Private\.DC/([\d.]+)\;version:\1`,
    },
  },
  // NOT verified: ExpandCart's documented store and CDN hosts; low-confidence markers.
  ExpandCart: {
    cats: [6],
    scriptSrc: [String.raw`(?:^|\.|//)expandcart\.com/\;confidence:50`],
    html: [String.raw`<link[^>]+href="https?://[^"/]*expandcart\.com/\;confidence:30`],
  },
  // webappanalyzer's Matjrah (assets.matjrah.store) is kept; Tajer has no marker we trust yet.
}

const CATEGORY_KIND: ReadonlyMap<number, PlatformKind> = new Map([
  [1, 'platform'],
  [6, 'platform'],
  [11, 'platform'],
  [51, 'builder'],
  [87, 'plugin'],
  [10, 'service'],
  [31, 'service'],
  [12, 'service'],
  [18, 'service'],
  [42, 'service'],
])

let loaded: Readonly<Record<string, Fingerprint>> | undefined
let sources: ReadonlySet<string> = new Set()

function fingerprints(): Readonly<Record<string, Fingerprint>> {
  if (loaded !== undefined) return loaded
  const file = new URL('../../vendor/webappanalyzer/fingerprints.json', import.meta.url)
  const vendored = JSON.parse(readFileSync(file, 'utf8')) as Vendored
  const merged: Record<string, Fingerprint> = { ...vendored.techs }
  for (const [name, own] of Object.entries(ARAB_FINGERPRINTS)) {
    merged[name] = mergeFingerprints(merged[name], own)
  }
  sources = new Set(Object.keys(ARAB_FINGERPRINTS))
  loaded = merged
  return merged
}

const list = <T>(value: T | readonly T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? [...(value as T[])] : [value as T]

function mergeFingerprints(base: Fingerprint | undefined, own: Fingerprint): Fingerprint {
  if (base === undefined) return own
  const map = (a: Fingerprint['headers'], b: Fingerprint['headers']) => {
    const out: Record<string, string[]> = {}
    for (const source of [a ?? {}, b ?? {}]) {
      for (const [key, value] of Object.entries(source)) {
        out[key.toLowerCase()] = [...(out[key.toLowerCase()] ?? []), ...list(value)]
      }
    }
    return out
  }
  return {
    cats: own.cats ?? base.cats ?? [],
    headers: map(base.headers, own.headers),
    cookies: map(base.cookies, own.cookies),
    meta: map(base.meta, own.meta),
    scriptSrc: [...list(base.scriptSrc), ...list(own.scriptSrc)],
    html: [...list(base.html), ...list(own.html)],
    url: [...list(base.url), ...list(own.url)],
    implies: [...list(base.implies), ...list(own.implies)],
  }
}

interface Pattern {
  readonly re: RegExp | null
  readonly version: string | null
  readonly confidence: number
}

/** What webappanalyzer separates a pattern's options with: a backslash and a semicolon. */
const OPTION_SEPARATOR = String.raw`\;`

const compiled = new Map<string, Pattern | null>()

/** `regex\;version:\1\;confidence:50`; an empty regex means "present". */
function parsePattern(raw: string): Pattern | null {
  const cached = compiled.get(raw)
  if (cached !== undefined) return cached
  const [source = '', ...options] = raw.split(OPTION_SEPARATOR)
  let version: string | null = null
  let confidence = 100
  for (const option of options) {
    if (option.startsWith('version:')) version = option.slice('version:'.length)
    else if (option.startsWith('confidence:'))
      confidence = Number(option.slice('confidence:'.length))
  }
  let pattern: Pattern | null
  try {
    pattern = {
      re: source === '' ? null : new RegExp(source, 'i'),
      version,
      confidence: Number.isFinite(confidence) ? Math.min(100, Math.max(1, confidence)) : 100,
    }
  } catch {
    pattern = null
  }
  compiled.set(raw, pattern)
  return pattern
}

/** The version a pattern's template makes of its match: `\1`, or `\1?a:b` for "a if group 1". */
function versionOf(template: string | null, match: RegExpExecArray): string | null {
  if (template === null) return null
  const group = (n: string) => match[Number(n)] ?? ''
  const ternary = /^\\(\d)\?([^:]*):(.*)$/.exec(template)
  const text = ternary
    ? group(ternary[1] ?? '') !== ''
      ? (ternary[2] ?? '')
      : (ternary[3] ?? '')
    : template
  const version = text.replace(/\\(\d)/g, (_all, n: string) => group(n)).trim()
  return /^[\w.+-]{1,32}$/.test(version) ? version : null
}

/** The most one string of a page is read to its end: patterns are written for such addresses. */
const MAX_STRING = 2048
const MAX_SCRIPTS = 500
const MAX_MARKUP = 100_000

interface Haystack {
  readonly headers: ReadonlyMap<string, string[]>
  readonly cookies: ReadonlyMap<string, string>
  readonly meta: ReadonlyMap<string, string[]>
  readonly scripts: readonly string[]
  readonly markup: string
  readonly url: string
}

const cap = (text: string, max = MAX_STRING) => (text.length > max ? text.slice(0, max) : text)

function haystackOf(page: PageFacts): Haystack {
  const headers = new Map<string, string[]>()
  const cookies = new Map<string, string>()
  for (const [name, value] of page.headers) {
    const key = name.toLowerCase()
    headers.set(key, [...(headers.get(key) ?? []), cap(value)])
  }
  for (const line of headerValues(page.headers, 'set-cookie')) {
    const pair = line.split(';')[0] ?? ''
    const at = pair.indexOf('=')
    if (at > 0) cookies.set(pair.slice(0, at).trim().toLowerCase(), cap(pair.slice(at + 1).trim()))
  }
  const meta = new Map<string, string[]>()
  const scripts: string[] = []
  const markup: string[] = []
  const html = page.html
  if (html !== null) {
    for (const element of html.metas) {
      const name = (element.name ?? element.property ?? element.httpEquiv ?? '').toLowerCase()
      if (name === '' || element.content === null) continue
      meta.set(name, [...(meta.get(name) ?? []), cap(element.content)])
      markup.push(`<meta name="${name}" content="${cap(element.content, 300)}">`)
    }
    for (const script of html.scripts.slice(0, MAX_SCRIPTS)) {
      if (script.src === null) continue
      let src = script.src
      try {
        src = new URL(script.src, html.baseUrl).href
      } catch {
        // Kept as written.
      }
      scripts.push(cap(src))
      markup.push(`<script src="${cap(src)}"></script>`)
    }
    for (const link of html.links.slice(0, MAX_SCRIPTS)) {
      if (link.href === null) continue
      markup.push(`<link rel="${link.rel.join(' ')}" href="${cap(link.href)}">`)
    }
  }
  return {
    headers,
    cookies,
    meta,
    scripts,
    markup: markup.join('\n').slice(0, MAX_MARKUP),
    url: cap(page.url),
  }
}

interface Hit {
  confidence: number
  version: string | null
  evidence: string[]
}

function test(pattern: Pattern | null, text: string): { match: RegExpExecArray | null } | null {
  if (pattern === null) return null
  if (pattern.re === null) return { match: null }
  const match = pattern.re.exec(text)
  return match === null ? null : { match }
}

function hitsOf(tech: Fingerprint, hay: Haystack): Hit {
  const hit: Hit = { confidence: 0, version: null, evidence: [] }
  const add = (pattern: Pattern, match: RegExpExecArray | null, evidence: string) => {
    hit.confidence += pattern.confidence
    if (hit.version === null && match !== null) hit.version = versionOf(pattern.version, match)
    if (hit.evidence.length < 3) hit.evidence.push(cap(evidence, 160))
  }
  for (const [name, values] of Object.entries(tech.headers ?? {})) {
    for (const raw of list(values)) {
      const pattern = parsePattern(raw)
      for (const value of hay.headers.get(name.toLowerCase()) ?? []) {
        const found = test(pattern, value)
        if (found !== null && pattern !== null) {
          add(pattern, found.match, `header ${name}: ${value}`)
          break
        }
      }
    }
  }
  for (const [name, values] of Object.entries(tech.cookies ?? {})) {
    const value = hay.cookies.get(name.toLowerCase())
    if (value === undefined) continue
    for (const raw of list(values)) {
      const pattern = parsePattern(raw)
      const found = test(pattern, value)
      if (found !== null && pattern !== null) add(pattern, found.match, `cookie ${name}`)
    }
  }
  for (const [name, values] of Object.entries(tech.meta ?? {})) {
    for (const raw of list(values)) {
      const pattern = parsePattern(raw)
      for (const value of hay.meta.get(name.toLowerCase()) ?? []) {
        const found = test(pattern, value)
        if (found !== null && pattern !== null) {
          add(pattern, found.match, `meta ${name}: ${value}`)
          break
        }
      }
    }
  }
  for (const raw of list(tech.scriptSrc)) {
    const pattern = parsePattern(raw)
    for (const src of hay.scripts) {
      const found = test(pattern, src)
      if (found !== null && pattern !== null) {
        add(pattern, found.match, `script ${src}`)
        break
      }
    }
  }
  for (const raw of list(tech.html)) {
    const pattern = parsePattern(raw)
    const found = test(pattern, hay.markup)
    if (found !== null && pattern !== null) {
      add(pattern, found.match, `markup ${found.match?.[0] ?? ''}`)
    }
  }
  for (const raw of list(tech.url)) {
    const pattern = parsePattern(raw)
    const found = test(pattern, hay.url)
    if (found !== null && pattern !== null) add(pattern, found.match, `address ${hay.url}`)
  }
  return hit
}

/** The most technologies a report lists: a page has a few dozen at the very most. */
export const MAX_DETECTED = 40

const idOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function kindOf(cats: readonly number[]): PlatformKind | null {
  for (const cat of cats) {
    const kind = CATEGORY_KIND.get(cat)
    if (kind !== undefined) return kind
  }
  return null
}

/** One page is read once, whatever asks: the rule, and the report's facts. */
const read = new WeakMap<PageFacts, Detected[]>()

/** The technologies a page shows, the surest first; platforms before the rest. */
export function detectPlatforms(page: PageFacts): Detected[] {
  const known = read.get(page)
  if (known !== undefined) return known
  const detected = detect(page)
  read.set(page, detected)
  return detected
}

function detect(page: PageFacts): Detected[] {
  const techs = fingerprints()
  const hay = haystackOf(page)
  const found = new Map<string, Hit>()
  for (const [name, tech] of Object.entries(techs)) {
    const hit = hitsOf(tech, hay)
    if (hit.confidence > 0) found.set(name, hit)
  }
  // What a technology implies is there too, with the confidence of the implying pattern.
  for (const [name, hit] of [...found]) {
    for (const raw of list(techs[name]?.implies)) {
      const pattern = parsePattern(raw)
      const implied = raw.split(OPTION_SEPARATOR)[0] ?? ''
      if (pattern === null || !(implied in techs)) continue
      const confidence = Math.min(hit.confidence, pattern.confidence)
      const known = found.get(implied)
      if (known === undefined) {
        found.set(implied, { confidence, version: null, evidence: [`implied by ${name}`] })
      }
    }
  }
  const order: Record<PlatformKind, number> = { platform: 0, builder: 1, plugin: 2, service: 3 }
  return [...found]
    .flatMap(([name, hit]): Detected[] => {
      const kind = kindOf(techs[name]?.cats ?? [])
      if (kind === null) return []
      return [
        {
          id: idOf(name),
          name,
          kind,
          version: hit.version,
          confidence: Math.min(100, hit.confidence),
          evidence: hit.evidence,
          source: sources.has(name) ? 'arablyzer' : 'webappanalyzer',
        },
      ]
    })
    .sort(
      (a, b) =>
        order[a.kind] - order[b.kind] ||
        b.confidence - a.confidence ||
        a.name.localeCompare(b.name),
    )
    .slice(0, MAX_DETECTED)
}

/** high from 75, medium from 50, else low: how a report words a confidence. */
export function confidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  return confidence >= 75 ? 'high' : confidence >= 50 ? 'medium' : 'low'
}
