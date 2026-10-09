import {
  reportOn,
  sseData,
  visitorAddresses,
  type Outcome,
  type Series,
  type SeriesReport,
} from './measure'

// The load test's requests (infra/load/README.md): what visitors' browsers send to the stack, the
// pages, the API's scan routes and its refusals, from many visitors and from one that asks for too
// much, timed. `fetch` is the caller's, so that the tests run it against answers of their own.

/** What Cloudflare's test site keys give, and its test secret accepts (infra/.env.example). */
export const TEST_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'

/** The scans a phase starts at once: the queue takes one scan at a time, and a visitor holds few. */
const SCAN_WIDTH = 3
/** A tool page's scan starts no browser: seconds. A whole scan runs three, up to its budget. */
const TOOL_SCAN_MS = 60_000
const FULL_SCAN_MS = 300_000
const REQUEST_MS = 30_000

export interface LoadOptions {
  readonly target: URL
  /** The Origin of a scan request: exactly the stack's ARABLYZER_SITE. */
  readonly origin: string
  /** The page the scans ask for, which the stack must be able to reach. */
  readonly scanUrl: string
  /** The tool page that is fetched, and whose rules the tool scans run alone. */
  readonly tool: string
  /** Requests for each of the two pages. */
  readonly pages: number
  /** Requests for each kind of refusal. */
  readonly refusals: number
  /** Visitors that each start one tool scan and watch it to its end. */
  readonly visitors: number
  /** Requests for each of the routes that read a finished scan. */
  readonly reads: number
  /** Scans that one visitor asks for, past what it may have. */
  readonly burst: number
  /** Whole scans, in the three browsers, one after another. */
  readonly full: number
  /** Requests in flight at once for the pages, the refusals and the reads. */
  readonly concurrency: number
  /** Leave the scans the run made; by default each is deleted with its own token. */
  readonly keep: boolean
}

export interface LoadDeps {
  readonly fetch: typeof fetch
  /** Milliseconds, monotonic. */
  readonly clock: () => number
  readonly say: (line: string) => void
}

export interface Limits {
  /** Scans the one visitor asked for. */
  readonly asked: number
  readonly accepted: number
  /** 429s with a Retry-After: a window of scans, requests or a host's that is used up. */
  readonly refusedForAWhile: number
  /** 429s without one: the visitor has as many scans queued or running as it may. */
  readonly refusedForNow: number
  /** The longest wait a 429 named, in seconds. */
  readonly longestWait: number
}

export interface LoadResult {
  readonly series: SeriesReport[]
  readonly limits: Limits | null
  /** What the run has to say beside its numbers: a scan that ended partial, a phase it skipped. */
  readonly notes: string[]
  /** Requests with no answer, or an answer that the stack is not meant to give. */
  readonly errors: number
  /** Whether the run showed what it is for: no error, and the limits refusing where it asked. */
  readonly ok: boolean
}

interface Reply extends Outcome {
  readonly text: string
  readonly headers: Headers
}

interface Created {
  readonly id: string
  readonly deleteToken: string
}

/** What a run will send, and how much of it reaches the stack's Turnstile check. */
export function describePlan(options: LoadOptions): string[] {
  const scans = options.visitors + options.burst + options.full
  const reads = options.visitors > 0 ? 3 * options.reads : 0
  const made = options.visitors + options.full
  const requests =
    2 * options.pages +
    (options.refusals > 0 ? 2 * options.refusals : 0) +
    2 * options.visitors +
    reads +
    options.burst +
    3 * options.full +
    (options.keep ? 0 : made + options.burst)
  return [
    `Load test of ${options.target.origin}`,
    `  scans ask for ${options.scanUrl}, from ${options.origin}; tool scans run ${options.tool}`,
    `  up to ${String(requests)} requests, ${String(options.concurrency)} at once`,
    `  ${String(scans)} of them ask to start a scan: each one that passes its visitor's throttle makes the`,
    `  stack's API ask Cloudflare's Turnstile check (siteverify, with the test secret) through its`,
    `  egress proxy, so at most ${String(scans)} requests of this run go beyond the stack`,
  ]
}

/** Why a request had no answer, in a word: the code of its cause (ECONNREFUSED), else its name. */
function failureOf(error: unknown): string {
  if (!(error instanceof Error)) return 'error'
  const { cause } = error
  if (cause instanceof Error) {
    return 'code' in cause && typeof cause.code === 'string' ? cause.code : cause.message
  }
  return error.name
}

async function send(
  deps: LoadDeps,
  target: URL,
  path: string,
  init: RequestInit = {},
): Promise<Reply> {
  const started = deps.clock()
  try {
    const response = await deps.fetch(new URL(path, target), {
      ...init,
      signal: AbortSignal.timeout(REQUEST_MS),
    })
    const text = await response.text()
    return { ms: deps.clock() - started, status: response.status, text, headers: response.headers }
  } catch (error) {
    return {
      ms: deps.clock() - started,
      status: 0,
      failure: failureOf(error),
      text: '',
      headers: new Headers(),
    }
  }
}

const outcomeOf = ({ ms, status, failure }: Reply): Outcome =>
  failure === undefined ? { ms, status } : { ms, status, failure }

/** `count` tasks with `width` of them running at once, their results in order. */
async function inParallel<T>(
  count: number,
  width: number,
  task: (index: number) => Promise<T>,
): Promise<T[]> {
  const results = new Array<T>(count)
  let next = 0
  const lane = async () => {
    for (let index = next++; index < count; index = next++) results[index] = await task(index)
  }
  await Promise.all(Array.from({ length: Math.min(width, count) }, lane))
  return results
}

async function timed(
  deps: LoadDeps,
  name: string,
  expected: readonly number[],
  count: number,
  width: number,
  request: (index: number) => Promise<Outcome>,
): Promise<Series> {
  const started = deps.clock()
  const outcomes = await inParallel(count, width, request)
  return { name, expected, outcomes, wallMs: deps.clock() - started }
}

/**
 * A request to start a scan, as the site's form sends it, from the visitor at `address` where
 * there is one: the site's server puts the address it is told of in the header the API counts by.
 */
function scanRequest(
  origin: string,
  body: Readonly<Record<string, string>>,
  address?: string,
): RequestInit {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      ...(address === undefined ? {} : { 'x-forwarded-for': address }),
    },
    body: JSON.stringify({ turnstileToken: TEST_TOKEN, ...body }),
  }
}

/** The scan a 202 gave, or null for any other answer, or for one that is not what the API sends. */
function createdBy(reply: Reply): Created | null {
  if (reply.status !== 202) return null
  try {
    const body = JSON.parse(reply.text) as { id?: unknown; deleteToken?: unknown }
    return typeof body.id === 'string' && typeof body.deleteToken === 'string'
      ? { id: body.id, deleteToken: body.deleteToken }
      : null
  } catch {
    return null
  }
}

/** A scan's events, as its page follows them, until its end: how long that took, and its state. */
async function follow(
  deps: LoadDeps,
  target: URL,
  scan: Created,
  address: string,
  timeoutMs: number,
): Promise<{ outcome: Outcome; state: string | null }> {
  const started = deps.clock()
  const ended = (failure?: string, state: string | null = null) => ({
    outcome:
      failure === undefined
        ? { ms: deps.clock() - started, status: 200 }
        : { ms: deps.clock() - started, status: 0, failure },
    state,
  })
  try {
    const response = await deps.fetch(new URL(`/api/scans/${scan.id}/events`, target), {
      headers: { 'x-forwarded-for': address },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.status !== 200 || response.body === null) {
      await response.body?.cancel()
      return { outcome: { ms: deps.clock() - started, status: response.status }, state: null }
    }
    let text = ''
    const decoder = new TextDecoder()
    for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
      const seen = sseData(text + decoder.decode(chunk, { stream: true }))
      text = seen.rest
      for (const data of seen.data) {
        const event = JSON.parse(data) as { type?: unknown; state?: unknown }
        if (event.type === 'error') return ended('the scan failed', 'failed')
        if (event.type === 'done') return ended(undefined, String(event.state))
      }
    }
    return ended('the stream ended before the scan did')
  } catch (error) {
    return ended(failureOf(error))
  }
}

/** Every request of the run, in its phases; the numbers are the result's. */
export async function runLoad(options: LoadOptions, deps: LoadDeps): Promise<LoadResult> {
  const { target, origin, scanUrl, tool, concurrency } = options
  const series: Series[] = []
  const notes: string[] = []
  const created: Created[] = []
  const visitors = visitorAddresses(options.visitors + 1 + options.full)
  const address = (index: number) => visitors[index] ?? '198.18.0.1'
  const ask = (init: RequestInit) => send(deps, target, '/api/scans', init)
  const get = (path: string) => send(deps, target, path)

  if (options.pages > 0) {
    deps.say('Pages')
    for (const path of ['/', `/tools/${tool}`]) {
      series.push(
        await timed(deps, `GET ${path}`, [200], options.pages, concurrency, async () =>
          outcomeOf(await get(path)),
        ),
      )
    }
  }

  // What the API refuses before it counts a visitor or asks Turnstile: another site's Origin, and a
  // name that is internal (the URL's own checks). A private address written as one is refused in
  // the name lookup, after both, so it is not one of these (it costs a Turnstile check).
  if (options.refusals > 0) {
    deps.say('Refusals of requests that are no scan')
    const refused = (name: string, status: number, from: string, url: string) =>
      timed(deps, name, [status], options.refusals, concurrency, async () =>
        outcomeOf(await ask(scanRequest(from, { url }))),
      )
    series.push(
      await refused('POST /api/scans, from another origin', 400, 'https://other.invalid', scanUrl),
      await refused('POST /api/scans, an internal host name', 422, origin, 'http://localhost/'),
    )
  }

  // Visitors that each ask for one tool scan and watch it to its end.
  const finished: Created[] = []
  if (options.visitors > 0) {
    deps.say(`Scans: ${String(options.visitors)} visitors, one tool scan each`)
    const ends: Outcome[] = []
    const posts = await timed(
      deps,
      'POST /api/scans, one visitor each',
      [202],
      options.visitors,
      SCAN_WIDTH,
      async (index) => {
        const visitor = address(index)
        const reply = await ask(scanRequest(origin, { url: scanUrl, tool }, visitor))
        const scan = createdBy(reply)
        if (scan === null) return outcomeOf(reply)
        created.push(scan)
        const watched = await follow(deps, target, scan, visitor, TOOL_SCAN_MS)
        ends.push(watched.outcome)
        if (watched.state === 'complete' || watched.state === 'partial') finished.push(scan)
        return outcomeOf(reply)
      },
    )
    series.push(posts, {
      name: 'events of a tool scan, to its end',
      expected: [200],
      outcomes: ends,
      wallMs: posts.wallMs,
    })
    if (posts.outcomes.some(({ status }) => status === 429)) {
      notes.push(
        'a visitor was refused its first scan: the stack reads one address for every request. Its ' +
          "site's server believes X-Forwarded-For only from an address in ARABLYZER_TRUSTED_PROXIES " +
          '(the private ranges when it is empty), so the visitors that the run makes up are one.',
      )
    }
  }

  if (options.reads > 0) {
    if (finished.length === 0) {
      notes.push('no scan finished, so the reads of a finished scan were skipped')
    } else {
      deps.say('Reads of finished scans')
      const reads: readonly (readonly [string, (id: string) => string])[] = [
        ['GET /api/scans/:id', (id) => `/api/scans/${id}`],
        ['GET /api/scans/:id/events, finished', (id) => `/api/scans/${id}/events`],
        ['GET /api/reports/:id', (id) => `/api/reports/${id}`],
      ]
      for (const [name, path] of reads) {
        series.push(
          await timed(deps, name, [200], options.reads, concurrency, async (index) =>
            outcomeOf(await get(path(finished[index % finished.length]?.id ?? ''))),
          ),
        )
      }
    }
  }

  // One visitor that asks for more scans than it may have.
  let limits: Limits | null = null
  if (options.burst > 0) {
    deps.say(`Limits: one visitor asks for ${String(options.burst)} scans`)
    const visitor = address(options.visitors)
    const accepted: Created[] = []
    let forAWhile = 0
    let forNow = 0
    let longestWait = 0
    const burst = await timed(
      deps,
      'POST /api/scans, one visitor past its limits',
      [202, 429],
      options.burst,
      SCAN_WIDTH,
      async () => {
        const reply = await ask(scanRequest(origin, { url: scanUrl, tool }, visitor))
        const scan = createdBy(reply)
        if (scan !== null) {
          accepted.push(scan)
          created.push(scan)
        }
        if (reply.status !== 429) return outcomeOf(reply)
        // A refusal is the API's own: its word, and how long to wait where waiting helps.
        let word: unknown
        try {
          word = (JSON.parse(reply.text) as { error?: unknown }).error
        } catch {
          word = undefined
        }
        if (word !== 'rate-limited') {
          return { ms: reply.ms, status: 0, failure: 'a 429 that does not say rate-limited' }
        }
        const wait = Number(reply.headers.get('retry-after'))
        if (wait > 0) {
          forAWhile++
          longestWait = Math.max(longestWait, wait)
        } else forNow++
        return outcomeOf(reply)
      },
    )
    series.push(burst)
    limits = {
      asked: options.burst,
      accepted: accepted.length,
      refusedForAWhile: forAWhile,
      refusedForNow: forNow,
      longestWait,
    }
    // The scans it did start end before the next phase, which times a scan of its own.
    await Promise.all(accepted.map((scan) => follow(deps, target, scan, visitor, TOOL_SCAN_MS)))
  }

  // Whole scans, in the three browsers: last, since the scanner then starts a clean process.
  if (options.full > 0) {
    deps.say(`Whole scans: ${String(options.full)}, in three browsers`)
    const posts: Outcome[] = []
    const ends: Outcome[] = []
    const started = deps.clock()
    for (let index = 0; index < options.full; index++) {
      const visitor = address(options.visitors + 1 + index)
      const reply = await ask(scanRequest(origin, { url: scanUrl }, visitor))
      posts.push(outcomeOf(reply))
      const scan = createdBy(reply)
      if (scan === null) continue
      created.push(scan)
      const watched = await follow(deps, target, scan, visitor, FULL_SCAN_MS)
      ends.push(watched.outcome)
      const report = await get(`/api/reports/${scan.id}`)
      try {
        const { render } = (
          JSON.parse(report.text) as { scan: { render: { engine: string; status: string }[] } }
        ).scan
        if (render.some((run) => run.status !== 'rendered')) {
          const said = render.map((run) => `${run.engine} ${run.status}`).join(', ')
          notes.push(`a whole scan ended ${watched.state ?? 'with no state'}: ${said}`)
        }
      } catch {
        notes.push(`the report of a whole scan (${watched.state ?? 'no state'}) could not be read`)
      }
    }
    const wallMs = deps.clock() - started
    series.push(
      { name: 'POST /api/scans, a whole scan', expected: [202], outcomes: posts, wallMs },
      { name: 'events of a whole scan, to its end', expected: [200], outcomes: ends, wallMs },
    )
  }

  if (!options.keep && created.length > 0) {
    deps.say(`Cleaning up: ${String(created.length)} scans, each deleted with its own token`)
    series.push(
      await timed(
        deps,
        'DELETE /api/reports/:id',
        [204],
        created.length,
        concurrency,
        async (index) => {
          const scan = created[index]
          if (scan === undefined) return { ms: 0, status: 0, failure: 'no scan' }
          return outcomeOf(
            await send(deps, target, `/api/reports/${scan.id}`, {
              method: 'DELETE',
              headers: { authorization: `Bearer ${scan.deleteToken}` },
            }),
          )
        },
      ),
    )
  }

  const reports = series.map(reportOn)
  const errors = reports.reduce((total, report) => total + report.errors, 0)
  const refusing = limits === null || limits.refusedForAWhile + limits.refusedForNow > 0
  if (!refusing) {
    notes.push(
      `the limits did not refuse: the visitor asked for ${String(options.burst)} scans and had them all. Ask for more (--burst), or start the stack with smaller limits.`,
    )
  }
  return { series: reports, limits, notes, errors, ok: errors === 0 && refusing }
}

const millis = (value: number) =>
  value < 10 ? value.toFixed(2) : value < 100 ? value.toFixed(1) : value.toFixed(0)

const statusesOf = (statuses: Readonly<Record<string, number>>) =>
  Object.entries(statuses)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([status, count]) => `${status === '0' ? 'none' : status}×${String(count)}`)
    .join(' ')

/** The run's numbers as a table, and what it has to say beside them. */
export function formatResult(result: LoadResult): string[] {
  const rows = [
    ['series', 'n', 'p50 ms', 'p95 ms', 'max ms', 'per s', 'statuses', 'errors'],
    ...result.series.map((report) => [
      report.name,
      String(report.n),
      millis(report.p50),
      millis(report.p95),
      millis(report.max),
      report.perSecond.toFixed(1),
      statusesOf(report.statuses),
      String(report.errors),
    ]),
  ]
  const widths = (rows[0] ?? []).map((_, column) =>
    Math.max(...rows.map((row) => row[column]?.length ?? 0)),
  )
  const lines = rows.map((row) =>
    row
      .map((cell, column) => {
        const width = widths[column] ?? 0
        return column === 0 || column === 6 ? cell.padEnd(width) : cell.padStart(width)
      })
      .join('  ')
      .trimEnd(),
  )
  const failed = result.series.flatMap((report) =>
    Object.entries(report.failures).map(
      ([failure, count]) => `  ${report.name}: no answer, ${failure} ×${String(count)}`,
    ),
  )
  if (failed.length > 0) lines.push('', ...failed)
  const { limits } = result
  if (limits !== null) {
    lines.push(
      '',
      `Limits: one visitor asked for ${String(limits.asked)} scans and had ${String(limits.accepted)} (202).`,
      `  429 with a Retry-After (a window is used up): ${String(limits.refusedForAWhile)}${
        limits.refusedForAWhile > 0 ? `, to wait up to ${String(limits.longestWait)} s` : ''
      }`,
      `  429 with none (scans queued or running, at the visitor's cap): ${String(limits.refusedForNow)}`,
    )
  }
  for (const note of result.notes) lines.push('', `Note: ${note}`)
  lines.push(
    '',
    `${String(result.errors)} errors. ${result.ok ? 'As designed.' : 'Not as designed.'}`,
  )
  return lines
}
