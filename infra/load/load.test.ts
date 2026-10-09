import { describe, expect, it } from 'vitest'
import { describePlan, formatResult, runLoad, TEST_TOKEN, type LoadOptions } from './load'

// The load test's phases against a stack made of answers: no network, and no stack. What the real
// stack answers, its own test and `pnpm load:stack` show.

const ORIGIN = 'https://example.com'

const options: LoadOptions = {
  target: new URL('http://127.0.0.1:8080'),
  origin: ORIGIN,
  scanUrl: 'http://93.184.215.50/',
  tool: 'rtl-check',
  pages: 5,
  refusals: 3,
  visitors: 3,
  reads: 4,
  burst: 6,
  full: 0,
  concurrency: 2,
  keep: false,
}

interface Seen {
  method: string
  path: string
  headers: Headers
  body: unknown
}

interface Behaviour {
  /** Scans a visitor may start before it is refused. */
  cap?: number
  /** The visitors are told apart by X-Forwarded-For; false, the stack sees one for all. */
  readsForwardedFor?: boolean
  /** Paths answered with this status instead. */
  broken?: Record<string, number>
  /** Paths whose request throws, as a connection that is reset does. */
  reset?: string[]
}

/** A stack that answers as the real one does, to the requests the load test makes. */
function stack(behaviour: Behaviour = {}) {
  const cap = behaviour.cap ?? 2
  const seen: Seen[] = []
  const started = new Map<string, number>()
  const tokens = new Map<string, string>()
  const deleted: string[] = []
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    })

  const fetchAnswer = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input)
    const method = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    seen.push({ method, path: url.pathname, headers, body })
    if (behaviour.reset?.includes(url.pathname) === true) {
      // As Node's fetch fails: a TypeError whose cause is the socket's error, with its code.
      const cause = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
      return Promise.reject(new TypeError('fetch failed', { cause }))
    }
    const broken = behaviour.broken?.[url.pathname]
    if (broken !== undefined) return Promise.resolve(new Response('no', { status: broken }))

    if (method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/tools/'))) {
      return Promise.resolve(new Response('<html lang="ar"></html>'))
    }
    if (method === 'POST' && url.pathname === '/api/scans') {
      const request = body as { url: string; turnstileToken: string }
      if (headers.get('origin') !== ORIGIN)
        return Promise.resolve(json({ error: 'bad-request' }, 400))
      if (request.turnstileToken !== TEST_TOKEN && !request.url.includes('localhost')) {
        return Promise.resolve(json({ error: 'turnstile-failed' }, 403))
      }
      if (request.url.includes('localhost'))
        return Promise.resolve(json({ error: 'blocked-host' }, 422))
      const visitor =
        behaviour.readsForwardedFor === false ? 'one' : (headers.get('x-forwarded-for') ?? 'none')
      const count = started.get(visitor) ?? 0
      if (count >= cap) {
        return Promise.resolve(
          json({ error: 'rate-limited', retryAfterSeconds: 1200 }, 429, { 'retry-after': '1200' }),
        )
      }
      started.set(visitor, count + 1)
      const id = `scan${String(tokens.size).padStart(18, '0')}`
      tokens.set(id, `token${id}`)
      return Promise.resolve(json({ id, deleteToken: `token${id}` }, 202))
    }
    const events = /^\/api\/scans\/([^/]+)\/events$/.exec(url.pathname)
    if (method === 'GET' && events !== null) {
      const text = [
        'id: 1\ndata: {"type":"queued","ahead":0}\n\n',
        'id: 2\ndata: {"type":"started","engines":[]}\n\nid: 3\ndata: {"type":"done","state":"complete"}\n\n',
      ]
      return Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              for (const part of text) controller.enqueue(new TextEncoder().encode(part))
              controller.close()
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
      )
    }
    if (method === 'GET' && /^\/api\/scans\/[^/]+$/.test(url.pathname)) {
      return Promise.resolve(json({ state: 'complete' }))
    }
    const report = /^\/api\/reports\/([^/]+)$/.exec(url.pathname)
    if (method === 'GET' && report !== null) {
      return Promise.resolve(
        json({ scan: { render: [{ engine: 'chromium', status: 'rendered' }] } }),
      )
    }
    if (method === 'DELETE' && report !== null) {
      const id = report[1] ?? ''
      if (headers.get('authorization') !== `Bearer ${tokens.get(id) ?? '-'}`) {
        return Promise.resolve(json({ error: 'forbidden' }, 403))
      }
      deleted.push(id)
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    return Promise.resolve(json({ error: 'not-found' }, 404))
  }
  return { fetch: fetchAnswer, seen, deleted, created: tokens }
}

async function run(behaviour: Behaviour = {}, override: Partial<LoadOptions> = {}) {
  const fake = stack(behaviour)
  let now = 0
  const said: string[] = []
  const result = await runLoad(
    { ...options, ...override },
    {
      fetch: fake.fetch,
      clock: () => (now += 1),
      say: (line) => said.push(line),
    },
  )
  return { ...fake, result, said }
}

const series = (result: Awaited<ReturnType<typeof run>>['result'], name: string) => {
  const found = result.series.find((entry) => entry.name === name)
  if (found === undefined) throw new Error(`No series ${name}`)
  return found
}

describe('a run against a stack that does as designed', () => {
  it('has no error, and its limits refuse the visitor that asks for too much', async () => {
    const { result } = await run()
    expect(result.errors).toBe(0)
    expect(result.ok).toBe(true)
    expect(result.limits).toEqual({
      asked: 6,
      accepted: 2,
      refusedForAWhile: 4,
      refusedForNow: 0,
      longestWait: 1200,
    })
    expect(series(result, 'POST /api/scans, one visitor past its limits').statuses).toEqual({
      '202': 2,
      '429': 4,
    })
  })

  it('times each kind of request the way the stack test does', async () => {
    const { result } = await run()
    expect(series(result, 'GET /').n).toBe(5)
    expect(series(result, 'GET /tools/rtl-check').statuses).toEqual({ '200': 5 })
    expect(series(result, 'POST /api/scans, from another origin').statuses).toEqual({ '400': 3 })
    expect(series(result, 'POST /api/scans, an internal host name').statuses).toEqual({ '422': 3 })
    expect(series(result, 'POST /api/scans, one visitor each').statuses).toEqual({ '202': 3 })
    expect(series(result, 'events of a tool scan, to its end').n).toBe(3)
    for (const name of [
      'GET /api/scans/:id',
      'GET /api/scans/:id/events, finished',
      'GET /api/reports/:id',
    ]) {
      expect(series(result, name).statuses, name).toEqual({ '200': 4 })
    }
  })

  it('sends the origin and the token of the stack, and a visitor of its own with each scan', async () => {
    const { seen } = await run()
    const posts = seen.filter((request) => request.method === 'POST')
    expect(posts.length).toBeGreaterThan(0)
    // A visitor's scan carries the visitor's address; the refusals are nobody's.
    const scans = posts.filter((request) => request.headers.has('x-forwarded-for'))
    for (const post of scans) {
      expect(post.headers.get('origin')).toBe(ORIGIN)
      expect(post.headers.get('content-type')).toBe('application/json')
      expect(post.body).toMatchObject({ turnstileToken: TEST_TOKEN, tool: 'rtl-check' })
    }
    // Three visitors, one scan each, and a fourth who asks for six.
    const visitors = new Set(scans.map((request) => request.headers.get('x-forwarded-for')))
    expect(visitors.size).toBe(4)
    for (const visitor of visitors) expect(visitor).toMatch(/^198\.1[89]\./)
    // The refusals are no visitor's: they carry no address to count.
    for (const request of posts.filter((entry) => !scans.includes(entry))) {
      expect(request.headers.get('x-forwarded-for')).toBeNull()
    }
  })

  it('deletes every scan it made with the scan’s own token, and leaves none with --keep', async () => {
    const cleaned = await run()
    expect(cleaned.deleted.sort()).toEqual([...cleaned.created.keys()].sort())
    expect(cleaned.deleted.length).toBe(5)
    expect(series(cleaned.result, 'DELETE /api/reports/:id').statuses).toEqual({ '204': 5 })

    const kept = await run({}, { keep: true })
    expect(kept.deleted).toEqual([])
    expect(kept.seen.some((request) => request.method === 'DELETE')).toBe(false)
  })

  it('runs no phase that it is told to skip', async () => {
    const { result, seen } = await run(
      {},
      { pages: 0, refusals: 0, visitors: 0, reads: 0, burst: 0 },
    )
    expect(result.series).toEqual([])
    expect(result.limits).toBeNull()
    expect(result.ok).toBe(true)
    expect(seen).toEqual([])
  })

  it('reads a whole scan’s report, and says nothing where every browser rendered', async () => {
    const { result } = await run({}, { full: 1, burst: 0 })
    expect(series(result, 'POST /api/scans, a whole scan').statuses).toEqual({ '202': 1 })
    expect(series(result, 'events of a whole scan, to its end').statuses).toEqual({ '200': 1 })
    expect(result.notes).toEqual([])
  })
})

describe('a run against a stack that does not', () => {
  it('counts a status it is not meant to give, and a request that gets no answer, as errors', async () => {
    const { result } = await run({ broken: { '/': 500 }, reset: ['/tools/rtl-check'] })
    expect(series(result, 'GET /').errors).toBe(5)
    expect(series(result, 'GET /tools/rtl-check').statuses).toEqual({ '0': 5 })
    expect(series(result, 'GET /tools/rtl-check').failures).toEqual({ ECONNRESET: 5 })
    expect(formatResult(result).join('\n')).toContain(
      'GET /tools/rtl-check: no answer, ECONNRESET ×5',
    )
    expect(result.errors).toBe(10)
    expect(result.ok).toBe(false)
  })

  it('says so when the limits refuse nobody', async () => {
    const { result } = await run({ cap: 100 })
    expect(result.limits).toMatchObject({ accepted: 6, refusedForAWhile: 0, refusedForNow: 0 })
    expect(result.errors).toBe(0)
    expect(result.ok).toBe(false)
    expect(result.notes.join(' ')).toContain('did not refuse')
  })

  it('says that the visitors are one where the stack reads one address for them all', async () => {
    const { result } = await run({ readsForwardedFor: false, cap: 1 })
    expect(series(result, 'POST /api/scans, one visitor each').errors).toBe(2)
    expect(result.notes.join(' ')).toContain('ARABLYZER_TRUSTED_PROXIES')
  })

  it('takes a 429 that is not the API’s own refusal for an error', async () => {
    const fake = stack({ cap: 0 })
    const strange: typeof fetch = async (input, init) => {
      const answer = await fake.fetch(input, init)
      return answer.status === 429 ? new Response('slow down', { status: 429 }) : answer
    }
    const result = await runLoad(
      { ...options, visitors: 0, burst: 3, refusals: 0, pages: 0 },
      { fetch: strange, clock: () => 0, say: () => undefined },
    )
    expect(series(result, 'POST /api/scans, one visitor past its limits').errors).toBe(3)
    expect(result.ok).toBe(false)
  })
})

describe('what it prints', () => {
  it('says what it will send, and how much of it goes beyond the stack', () => {
    const plan = describePlan(options).join('\n')
    expect(plan).toContain('http://127.0.0.1:8080')
    expect(plan).toContain('9 of them ask to start a scan')
    expect(plan).toContain('Turnstile')
  })

  it('is a table with its numbers, the limits in words, and its verdict', async () => {
    const { result } = await run()
    const text = formatResult(result).join('\n')
    expect(text).toMatch(/^series\s+n\s+p50 ms\s+p95 ms\s+max ms\s+per s\s+statuses\s+errors$/m)
    expect(text).toContain('GET /api/reports/:id')
    expect(text).toContain('one visitor asked for 6 scans and had 2 (202)')
    expect(text).toContain('to wait up to 1200 s')
    expect(text).toContain('0 errors. As designed.')
    expect(formatResult({ ...result, ok: false }).join('\n')).toContain('Not as designed.')
  })
})
