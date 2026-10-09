import { randomInt } from 'node:crypto'

// The load test's arithmetic and its guards, apart from its requests, so that they are tested
// without a stack (infra/load/README.md).

/** The value that `p` percent of the samples do not exceed, by the nearest-rank method. */
export function percentile(sortedAscending: readonly number[], p: number): number {
  const rank = Math.ceil((p / 100) * sortedAscending.length)
  return sortedAscending[Math.min(sortedAscending.length, Math.max(1, rank)) - 1] ?? 0
}

export interface Summary {
  readonly n: number
  readonly p50: number
  readonly p95: number
  readonly max: number
}

/** How many samples there are, and their median, 95th percentile and largest. */
export function summarize(samples: readonly number[]): Summary {
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    n: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted.at(-1) ?? 0,
  }
}

/** What one request came to: its time, and its HTTP status, or 0 where no answer came. */
export interface Outcome {
  readonly ms: number
  readonly status: number
  /** Why there was no answer: the error's code or name. */
  readonly failure?: string
}

/** The requests of one kind, and the statuses that the stack is meant to answer them with. */
export interface Series {
  readonly name: string
  readonly expected: readonly number[]
  readonly outcomes: Outcome[]
  /** How long the series took, from its first request to its last answer. */
  wallMs: number
}

export interface SeriesReport extends Summary {
  readonly name: string
  /** Requests answered per second, over the series' whole time. */
  readonly perSecond: number
  /** How many answers of each status; 0 is no answer at all. */
  readonly statuses: Readonly<Record<string, number>>
  /** Requests with no answer, or with a status the stack is not meant to give this one. */
  readonly errors: number
  /** Why requests had no answer, and how many for each: the error's code or name. */
  readonly failures: Readonly<Record<string, number>>
}

/** Latencies are those of the requests that got an answer; a request with none is an error. */
export function reportOn(series: Series): SeriesReport {
  const statuses: Record<string, number> = {}
  const failures: Record<string, number> = {}
  let errors = 0
  for (const { status, failure } of series.outcomes) {
    statuses[String(status)] = (statuses[String(status)] ?? 0) + 1
    if (!series.expected.includes(status)) errors++
    if (failure !== undefined) failures[failure] = (failures[failure] ?? 0) + 1
  }
  const answered = series.outcomes.filter(({ status }) => status !== 0).map(({ ms }) => ms)
  return {
    name: series.name,
    ...summarize(answered),
    perSecond: series.wallMs > 0 ? (answered.length * 1000) / series.wallMs : 0,
    statuses,
    errors,
    failures,
  }
}

/** A whole number of at least `min`, from a command-line value; the fallback where it is absent. */
export function wholeNumber(name: string, raw: string | undefined, fallback: number, min = 0) {
  if (raw === undefined) return fallback
  if (!/^\d{1,9}$/.test(raw) || Number(raw) < min) {
    throw new Error(`--${name} is a whole number of at least ${String(min)}, not ${raw}`)
  }
  return Number(raw)
}

/** Whether a URL names this machine: `localhost`, an address of 127.0.0.0/8, or ::1. */
export function isLoopback(url: URL): boolean {
  // The URL parser has written every spelling of an IPv4 address (decimal, hex, octal) as four
  // decimal parts, and an IPv6 one compressed, in brackets.
  const { hostname } = url
  return hostname === 'localhost' || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname)
}

export type Target =
  | { readonly ok: true; readonly url: URL; readonly remote: boolean }
  | { readonly ok: false; readonly reason: string }

/**
 * The stack to load. The default, and the address in the environment (ARABLYZER_STACK_URL, which
 * the stack's own test reads too), must be on this machine; only `--target`, written out, names
 * another, and it is then said to be one.
 */
export function chooseTarget(
  flag: string | undefined,
  environment: string | undefined,
  fallback: string,
): Target {
  const raw = flag ?? environment ?? fallback
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: `${raw} is not a URL` }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `${url.protocol} is not http or https` }
  }
  if (url.username !== '' || url.password !== '') {
    return { ok: false, reason: 'the target has a user name or a password in it' }
  }
  if (isLoopback(url)) return { ok: true, url, remote: false }
  if (flag === undefined) {
    return {
      ok: false,
      reason: `${url.host} is not on this machine: only --target names a stack that is not, and it is your own to load`,
    }
  }
  return { ok: true, url, remote: true }
}

/** Whether the environment is a CI run: the load test does not run there unless it is told to. */
export function inCi(env: Readonly<Record<string, string | undefined>>): boolean {
  const value = env.CI?.trim().toLowerCase() ?? ''
  return value !== '' && value !== '0' && value !== 'false'
}

/**
 * Visitors that are nobody's: addresses of 198.18.0.0/15, which RFC 2544 sets aside for benchmarks.
 * Not a private range, so that the site's server, which sees through the addresses it trusts, takes
 * one as the visitor's own.
 */
export function visitorAddresses(count: number): string[] {
  const addresses = new Set<string>()
  while (addresses.size < count) {
    addresses.add(
      `198.${String(18 + randomInt(2))}.${String(randomInt(256))}.${String(1 + randomInt(254))}`,
    )
  }
  return [...addresses]
}

/**
 * The `data:` of each complete event in a stream's text so far (an event ends at a blank line), and
 * what is left of it: an event that is not complete yet.
 */
export function sseData(text: string): { readonly data: string[]; readonly rest: string } {
  const data: string[] = []
  let rest = text.replaceAll('\r\n', '\n')
  for (let end = rest.indexOf('\n\n'); end >= 0; end = rest.indexOf('\n\n')) {
    const lines = rest
      .slice(0, end)
      .split('\n')
      .filter((line) => line.startsWith('data:'))
    rest = rest.slice(end + 2)
    if (lines.length > 0) data.push(lines.map((line) => line.slice(5).trimStart()).join('\n'))
  }
  return { data, rest }
}
