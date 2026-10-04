import {
  organizationalDomain,
  type LookalikeFacts,
  type LookalikeFound,
  type LookalikeKind,
} from '@arablyzer/collectors'
import { DEFAULT_DOH_URL } from '@arablyzer/egress'
import { json, pooled, sleep, TtlCache, type Ask } from './outside-http'

/** Candidates generated at most (docs/design/plans/arabic-native.md §9). */
export const MAX_CANDIDATES = 100
/** DNS lookups in flight at once, and the pause after each, so the resolver sees no burst. */
const DNS_CONCURRENCY = 5
const DNS_GAP_MS = 40
const DNS_TIMEOUT_MS = 8_000
/** All the DNS lookups together. */
export const DNS_TOTAL_MS = 40_000
/** Certificate Transparency is asked for this many names at most, one at a time. */
export const MAX_CT_QUERIES = 12
/** crt.sh is a free service that errs under load: one request at a time, this far apart, in this process. */
export const CT_GAP_MS = 1_500
const CT_TIMEOUT_MS = 15_000
const CT_MAX_BYTES = 2 * 1024 * 1024
export const CT_TOTAL_MS = 60_000
/** A certificate first seen within this many days is recent. */
export const RECENT_DAYS = 90
/** The answer is kept a day, and so is crt.sh's, so a rescan asks nobody again. */
const CACHE_MS = 24 * 60 * 60 * 1000

export const CT_ENDPOINT = 'https://crt.sh/'

/** The suffixes a look-alike is tried on: .com, .net, .co and the Arab ccTLDs people register under. */
export const SUFFIXES = [
  'com',
  'net',
  'co',
  'org',
  'sa',
  'com.sa',
  'ae',
  'eg',
  'com.eg',
  'kw',
  'com.kw',
  'qa',
  'com.qa',
  'bh',
  'om',
  'jo',
  'com.jo',
  'ma',
  'co.ma',
] as const

const KEYBOARD: Readonly<Record<string, string>> = {
  q: 'wa',
  w: 'qes',
  e: 'wrd',
  r: 'etf',
  t: 'ryg',
  y: 'tuh',
  u: 'yij',
  i: 'uok',
  o: 'ipl',
  p: 'ol',
  a: 'qsz',
  s: 'awdx',
  d: 'sefc',
  f: 'drgv',
  g: 'fthb',
  h: 'gyjn',
  j: 'hukm',
  k: 'jil',
  l: 'ko',
  z: 'asx',
  x: 'zsdc',
  c: 'xdfv',
  v: 'cfgb',
  b: 'vghn',
  n: 'bhjm',
  m: 'nj',
}

/**
 * Arabizi: the digits Arabic speakers type for the letters Latin does not have. 2 is ء (a hamza,
 * heard as an alef), 3 is ع, 5 is خ (kh), 6 is ط (t), 7 is ح (h), 9 is ق (q). Each pair is
 * [letters, digit] and works both ways.
 */
export const ARABIZI: readonly (readonly [string, string])[] = [
  ['a', '2'],
  ['a', '3'],
  ['kh', '5'],
  ['t', '6'],
  ['h', '7'],
  ['q', '9'],
]

const CONFUSABLE: readonly (readonly [string, string])[] = [
  ['rn', 'm'],
  ['m', 'rn'],
  ['l', 'i'],
  ['i', 'l'],
  ['o', '0'],
  ['l', '1'],
  ['w', 'vv'],
  ['cl', 'd'],
]

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export interface Candidate {
  readonly domain: string
  readonly kind: LookalikeKind
}

/** The domain split at its registrable label: «alwaha.com.sa» is «alwaha» and «com.sa». */
export function splitDomain(domain: string): { label: string; suffix: string } | null {
  const registrable = organizationalDomain(domain.toLowerCase())
  if (registrable === null) return null
  const dot = registrable.indexOf('.')
  if (dot <= 0) return null
  const label = registrable.slice(0, dot)
  const suffix = registrable.slice(dot + 1)
  return LABEL.test(label) && !label.startsWith('xn--') ? { label, suffix } : null
}

function* omissions(label: string): Generator<string> {
  for (let index = 0; index < label.length; index++)
    yield label.slice(0, index) + label.slice(index + 1)
}
function* doublings(label: string): Generator<string> {
  for (let index = 0; index < label.length; index++)
    yield label.slice(0, index + 1) + label.slice(index)
}
function* transpositions(label: string): Generator<string> {
  for (let index = 0; index + 1 < label.length; index++) {
    yield `${label.slice(0, index)}${label.charAt(index + 1)}${label.charAt(index)}${label.slice(index + 2)}`
  }
}
function* neighbours(label: string): Generator<string> {
  for (let index = 0; index < label.length; index++) {
    for (const near of KEYBOARD[label[index] ?? ''] ?? '') {
      yield label.slice(0, index) + near + label.slice(index + 1)
    }
  }
}
function* hyphens(label: string): Generator<string> {
  for (let index = 1; index < label.length; index++)
    yield `${label.slice(0, index)}-${label.slice(index)}`
}
function* swaps(label: string, pairs: readonly (readonly [string, string])[]): Generator<string> {
  for (const [from, to] of pairs) {
    for (let at = label.indexOf(from); at !== -1; at = label.indexOf(from, at + 1)) {
      yield label.slice(0, at) + to + label.slice(at + from.length)
    }
  }
}
function* arabizi(label: string): Generator<string> {
  yield* swaps(label, ARABIZI)
  yield* swaps(
    label,
    ARABIZI.map(([letters, digit]) => [digit, letters] as const),
  )
}

/**
 * The look-alikes of a domain, at most MAX_CANDIDATES, in a fixed order: the same name on the
 * other suffixes first, then the Arabizi digit swaps, then one of each typo in turn (a letter
 * left out, doubled, two swapped, a neighbouring key, a hyphen, a confusable) on the same suffix.
 */
export function generateLookalikes(domain: string): Candidate[] {
  const split = splitDomain(domain)
  if (split === null) return []
  const { label, suffix } = split
  const original = `${label}.${suffix}`
  const out: Candidate[] = []
  const seen = new Set([original])
  const add = (name: string, kind: LookalikeKind, onSuffix: string) => {
    if (out.length >= MAX_CANDIDATES || !LABEL.test(name)) return
    const full = `${name}.${onSuffix}`
    if (full.length > 253 || seen.has(full)) return
    seen.add(full)
    out.push({ domain: full, kind })
  }
  for (const other of SUFFIXES) add(label, 'tld', other)
  for (const name of arabizi(label)) add(name, 'arabizi', suffix)
  const typos: readonly (readonly [LookalikeKind, Generator<string>])[] = [
    ['omission', omissions(label)],
    ['doubling', doublings(label)],
    ['transposition', transpositions(label)],
    ['neighbour', neighbours(label)],
    ['hyphen', hyphens(label)],
    ['confusable', swaps(label, CONFUSABLE)],
  ]
  for (let live = typos.length; live > 0 && out.length < MAX_CANDIDATES;) {
    live = 0
    for (const [kind, names] of typos) {
      const next = names.next()
      if (next.done === true) continue
      live++
      add(next.value, kind, suffix)
    }
  }
  return out
}

const TYPE_CODE = { A: 1, MX: 15 } as const

/** Whether DoH (Cloudflare's JSON API) says the name has records of the type; null with no answer. */
async function has(
  ask: Ask,
  dohUrl: string,
  name: string,
  type: keyof typeof TYPE_CODE,
  signal: AbortSignal | undefined,
): Promise<boolean | null> {
  const url = new URL(dohUrl)
  url.searchParams.set('name', name)
  url.searchParams.set('type', type)
  const response = await ask({
    url: url.href,
    accept: 'application/dns-json',
    timeoutMs: DNS_TIMEOUT_MS,
    maxBytes: 64 * 1024,
    ...(signal === undefined ? {} : { signal }),
  })
  const body = json(response)
  if (response?.status !== 200 || typeof body !== 'object' || body === null) return null
  const status = (body as { Status?: unknown }).Status
  if (status === 3) return false
  if (status !== 0) return null
  const answers = (body as { Answer?: unknown }).Answer
  return (
    Array.isArray(answers) &&
    (answers as unknown[]).some(
      (answer) =>
        typeof answer === 'object' &&
        answer !== null &&
        (answer as { type?: unknown }).type === TYPE_CODE[type],
    )
  )
}

interface CertificateSummary {
  readonly certificates: number
  readonly firstSeen: string | null
}

const certificateCache = new TtlCache<CertificateSummary>(CACHE_MS)
let lastCtAt = 0

/** crt.sh's certificates for a name, kept a day. Null when it did not answer. */
async function certificatesOf(
  ask: Ask,
  name: string,
  signal: AbortSignal | undefined,
  now: () => number,
  endpoint: string,
  gapMs: number,
): Promise<CertificateSummary | null> {
  const cached = certificateCache.get(name)
  if (cached !== undefined) return cached
  const wait = lastCtAt + gapMs - now()
  if (wait > 0) await sleep(wait, signal)
  lastCtAt = now()
  const url = new URL(endpoint)
  url.searchParams.set('q', name)
  url.searchParams.set('output', 'json')
  const response = await ask({
    url: url.href,
    accept: 'application/json',
    timeoutMs: CT_TIMEOUT_MS,
    maxBytes: CT_MAX_BYTES,
    ...(signal === undefined ? {} : { signal }),
  })
  if (response?.status !== 200) return null
  const body = json(response)
  if (!Array.isArray(body)) return null
  let first: number | null = null
  for (const entry of body as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as { entry_timestamp?: unknown; not_before?: unknown }
    for (const value of [record.entry_timestamp, record.not_before]) {
      if (typeof value !== 'string') continue
      const time = Date.parse(
        value.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`,
      )
      if (Number.isFinite(time) && (first === null || time < first)) first = time
    }
  }
  const summary: CertificateSummary = {
    certificates: body.length,
    firstSeen: first === null ? null : new Date(first).toISOString().slice(0, 10),
  }
  certificateCache.set(name, summary)
  return summary
}

export interface LookalikeContext {
  readonly ask: Ask
  /** The DoH resolver with a JSON API (Cloudflare's, by default). */
  readonly dohUrl?: string
  readonly signal?: AbortSignal
  readonly now?: () => number
  /** Tests make these small. */
  readonly ctEndpoint?: string
  readonly ctGapMs?: number
  readonly dnsGapMs?: number
}

/**
 * The look-alikes of the scanned domain that exist: each candidate's A and MX records asked of the
 * DoH resolver (five at a time, with a pause), then Certificate Transparency (crt.sh, one request
 * at a time) for at most MAX_CT_QUERIES of the names that resolve, for the first certificate's date.
 * A scan of the same domain within a day reads the certificates from the cache. Only names go out
 * (never a page of the look-alike sites). When no lookup gets an answer, the result is `failed`.
 */
export async function findLookalikes(
  domain: string,
  context: LookalikeContext,
): Promise<LookalikeFacts> {
  const candidates = generateLookalikes(domain)
  const registrable = splitDomain(domain)
  const name = registrable === null ? domain : `${registrable.label}.${registrable.suffix}`
  if (candidates.length === 0) {
    return { outcome: 'checked', domain: name, candidates: 0, asked: 0, found: [], ct: 'checked' }
  }
  const now = context.now ?? Date.now
  const dohUrl = context.dohUrl ?? DEFAULT_DOH_URL
  const answers = await pooled(
    candidates,
    DNS_CONCURRENCY,
    context.dnsGapMs ?? DNS_GAP_MS,
    context.signal,
    async (candidate) => {
      const [address, mail] = await Promise.all([
        has(context.ask, dohUrl, candidate.domain, 'A', context.signal),
        has(context.ask, dohUrl, candidate.domain, 'MX', context.signal),
      ])
      return { candidate, address, mail }
    },
  )
  const answered = answers.filter(
    (item): item is NonNullable<typeof item> =>
      item !== undefined && (item.address !== null || item.mail !== null),
  )
  if (answered.length === 0)
    return { outcome: 'failed', domain: name, candidates: candidates.length }
  const resolving = answered.filter((item) => item.address === true || item.mail === true)
  // The names that can do harm first: they have a mail server, then an address.
  const ordered = [...resolving].sort(
    (a, b) =>
      Number(b.mail === true) - Number(a.mail === true) ||
      Number(b.address === true) - Number(a.address === true),
  )
  let ct: 'checked' | 'partial' | 'unavailable' = 'checked'
  const summaries = new Map<string, CertificateSummary>()
  let failures = 0
  for (const [index, item] of ordered.entries()) {
    if (index >= MAX_CT_QUERIES) {
      ct = 'partial'
      break
    }
    if (context.signal?.aborted === true) {
      ct = 'partial'
      break
    }
    const summary = await certificatesOf(
      context.ask,
      item.candidate.domain,
      context.signal,
      now,
      context.ctEndpoint ?? CT_ENDPOINT,
      context.ctGapMs ?? CT_GAP_MS,
    )
    if (summary === null) {
      failures++
      ct = 'partial'
      // crt.sh failing twice in a row is overloaded: asking more would only add to it.
      if (failures >= 2 && summaries.size === 0) {
        ct = 'unavailable'
        break
      }
      if (failures >= 3) break
      continue
    }
    summaries.set(item.candidate.domain, summary)
  }
  if (ordered.length === 0) ct = 'checked'
  const horizon = now() - RECENT_DAYS * 24 * 60 * 60 * 1000
  const found = ordered.map((item): LookalikeFound => {
    const summary = summaries.get(item.candidate.domain)
    return {
      domain: item.candidate.domain,
      kind: item.candidate.kind,
      address: item.address === true,
      mail: item.mail === true,
      firstSeen: summary?.firstSeen ?? null,
      certificates: summary?.certificates ?? null,
      recent: summary?.firstSeen != null && Date.parse(summary.firstSeen) >= horizon,
    }
  })
  return {
    outcome: 'checked',
    domain: name,
    candidates: candidates.length,
    asked: answers.filter((item) => item !== undefined).length,
    found,
    ct,
  }
}
