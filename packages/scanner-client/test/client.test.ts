import { describe, expect, it } from 'vitest'
import { MAX_SCANNER_EVENTS, remoteScanner, ScannerUnavailable, type Fetcher } from '../src/index'

const TOKEN = 'a-token-long-enough-to-be-the-workers-own'

/** A fetcher that answers with these chunks, and records what it was asked. */
function answering(chunks: readonly (string | Uint8Array)[], status = 200) {
  const asked: { url: string; init: RequestInit }[] = []
  const fetcher: Fetcher = (url, init) => {
    asked.push({ url, init })
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
        }
        controller.close()
      },
    })
    return Promise.resolve(new Response(body, { status }))
  }
  return { fetcher, asked }
}

describe('remoteScanner', () => {
  it('asks for the page with the token, and nothing about who asked', async () => {
    const { fetcher, asked } = answering([
      `${JSON.stringify({ type: 'error', message: 'stop' })}\n`,
    ])
    await expect(
      remoteScanner(
        'http://scanner:8788',
        TOKEN,
        fetcher,
      )({ url: 'https://example.com/' }, () => undefined),
    ).rejects.toThrow('stop')
    expect(asked).toHaveLength(1)
    expect(asked[0]?.url).toBe('http://scanner:8788/scan')
    expect(asked[0]?.init.method).toBe('POST')
    expect(asked[0]?.init.headers).toEqual({
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
    })
    expect(asked[0]?.init.body).toBe(JSON.stringify({ url: 'https://example.com/' }))
  })

  it("asks for a tool page's scan with its tool", async () => {
    const { fetcher, asked } = answering([
      `${JSON.stringify({ type: 'error', message: 'stop' })}\n`,
    ])
    await expect(
      remoteScanner(
        'http://scanner:8788',
        TOKEN,
        fetcher,
      )({ url: 'https://example.com/', tool: 'rtl-check' }, () => undefined),
    ).rejects.toThrow('stop')
    expect(asked[0]?.init.body).toBe(
      JSON.stringify({ url: 'https://example.com/', tool: 'rtl-check' }),
    )
  })

  it('reads a line cut across chunks, a letter cut across bytes, and a last line with no newline', async () => {
    const line = JSON.stringify({ type: 'error', message: 'تعذّر تشغيل المتصفح' })
    const bytes = new TextEncoder().encode(line)
    // Cut inside a two-byte Arabic letter.
    const cut = line.indexOf('ت') + 10
    const { fetcher } = answering([
      `${JSON.stringify({ type: 'event', event: { type: 'started', engines: [] } })}\n`,
      bytes.subarray(0, cut),
      bytes.subarray(cut),
    ])
    const seen: unknown[] = []
    await expect(
      remoteScanner(
        'http://scanner:8788',
        TOKEN,
        fetcher,
      )({ url: 'https://example.com/' }, (event) => seen.push(event)),
    ).rejects.toThrow('The scanner could not run the scan: تعذّر تشغيل المتصفح')
    expect(seen).toEqual([{ type: 'started', engines: [] }])
  })

  it("takes a scan's own steps: each once, robots.txt once a site, the render's for every engine", async () => {
    const render = (engine: string) => [
      { type: 'render-start', engine },
      {
        type: 'render',
        engine,
        version: null,
        status: 'rendered',
        requests: { total: 1, refused: 0 },
      },
    ]
    // robots.txt before the page, and for each other site one of its ten redirects leads to
    // (M2.4 plan §2).
    const events = [
      { type: 'started', engines: ['chromium', 'firefox', 'webkit'] },
      { type: 'robots', outcome: 'fetched', status: 200 },
      ...Array.from({ length: 10 }, () => ({
        type: 'robots',
        outcome: 'unavailable',
        status: 404,
      })),
      { type: 'page', status: 200, contentType: 'text/html', error: null },
      { type: 'crux', outcome: 'skipped' },
      ...render('chromium'),
      ...render('firefox'),
      ...render('webkit'),
      { type: 'lab-start' },
      { type: 'lab', status: 'measured' },
      { type: 'rules', rules: 40 },
    ]
    expect(events).toHaveLength(MAX_SCANNER_EVENTS)
    const { fetcher } = answering([
      ...events.map((event) => `${JSON.stringify({ type: 'event', event })}\n`),
      `${JSON.stringify({ type: 'error', message: 'stop' })}\n`,
    ])
    const seen: unknown[] = []
    await expect(
      remoteScanner(
        'http://scanner:8788',
        TOKEN,
        fetcher,
      )({ url: 'https://example.com/' }, (event) => seen.push(event)),
    ).rejects.toThrow('stop')
    expect(seen).toEqual(events)
  })

  it("refuses the queue's events and a scan's end, which are never the scanner's", async () => {
    for (const event of [
      { type: 'queued', ahead: 0 },
      { type: 'done', state: 'complete' },
      { type: 'error' },
    ]) {
      const { fetcher } = answering([`${JSON.stringify({ type: 'event', event })}\n`])
      const seen: unknown[] = []
      await expect(
        remoteScanner(
          'http://scanner:8788',
          TOKEN,
          fetcher,
        )({ url: 'https://example.com/' }, (seenEvent) => seen.push(seenEvent)),
        event.type,
      ).rejects.toThrow('The scanner sent a line its protocol does not have')
      expect(seen, event.type).toEqual([])
    }
  })

  it('refuses more events than a scan has', async () => {
    const started = `${JSON.stringify({ type: 'event', event: { type: 'started', engines: [] } })}\n`
    const { fetcher } = answering([started.repeat(MAX_SCANNER_EVENTS + 1)])
    const seen: unknown[] = []
    await expect(
      remoteScanner(
        'http://scanner:8788',
        TOKEN,
        fetcher,
      )({ url: 'https://example.com/' }, (event) => seen.push(event)),
    ).rejects.toThrow('The scanner sent more events than a scan has')
    expect(seen).toHaveLength(MAX_SCANNER_EVENTS)
  })

  it('refuses a line past its length, and an answer that is not 200', async () => {
    const long = answering(['x'.repeat(9 * 1024 * 1024)])
    await expect(
      remoteScanner(
        'http://scanner:8788',
        TOKEN,
        long.fetcher,
      )({ url: 'https://example.com/' }, () => undefined),
    ).rejects.toThrow(/too long/)
    const busy = answering(['{"error":"busy"}'], 503)
    await expect(
      remoteScanner(
        'http://scanner:8788',
        TOKEN,
        busy.fetcher,
      )({ url: 'https://example.com/' }, () => undefined),
    ).rejects.toThrow('The scanner answered 503')
  })

  it('gives up on a scanner that takes longer than its time', async () => {
    const hanging: Fetcher = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new Error('aborted'))
        })
      })
    await expect(
      remoteScanner(
        'http://scanner:8788',
        TOKEN,
        hanging,
        20,
      )({ url: 'https://example.com/' }, () => undefined),
    ).rejects.toThrow('aborted')
  })
})

// H1 of the pre-launch review: a scanner that had died, which Compose starts again (as it does after
// a scan that started a browser, M3), was not asked again: its scans failed, and so did the whole
// queue behind them. What says "not there" is a scan that has not started, so the worker can ask
// again, and only that.
describe('remoteScanner, when the scanner is not there', () => {
  const ask = (fetcher: Fetcher) =>
    remoteScanner(
      'http://scanner:8788',
      TOKEN,
      fetcher,
    )({ url: 'https://example.com/' }, () => {
      return undefined
    })

  /** As undici words a failed connection: fetch failed, and the system's error as its cause. */
  const failed = (code: string, message = `connect ${code}`) =>
    new TypeError('fetch failed', { cause: Object.assign(new Error(message), { code }) })

  it.each(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT'])(
    'says so when the connection fails with %s',
    async (code) => {
      const fetcher: Fetcher = () => Promise.reject(failed(code))
      const error = await ask(fetcher).catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(ScannerUnavailable)
      // The code is in the message, for the worker's log.
      expect((error as Error).message).toContain(code)
    },
  )

  it('says so when every address it tried refused, as a name with two addresses gives', async () => {
    const refused = Object.assign(new AggregateError([new Error('::1'), new Error('127.0.0.1')]), {
      code: 'ECONNREFUSED',
    })
    const fetcher: Fetcher = () => Promise.reject(new TypeError('fetch failed', { cause: refused }))
    await expect(ask(fetcher)).rejects.toBeInstanceOf(ScannerUnavailable)
  })

  it('says so when the scanner answers 503 before a line, busy or restarting', async () => {
    for (const body of ['{"error":"busy"}', '{"error":"restarting"}', '']) {
      const { fetcher } = answering([body], 503)
      const error = await ask(fetcher).catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(ScannerUnavailable)
      expect((error as Error).message).toBe('The scanner answered 503')
    }
  })

  it('does not say so of anything that may have started the scan', async () => {
    const other: [string, () => Promise<Response>][] = [
      ['a reset connection', () => Promise.reject(failed('ECONNRESET'))],
      ['a socket that closed', () => Promise.reject(failed('UND_ERR_SOCKET'))],
      [
        'a request that timed out',
        () => Promise.reject(new DOMException('timeout', 'TimeoutError')),
      ],
      ['a failure of no known kind', () => Promise.reject(new Error('boom'))],
      ['401', () => Promise.resolve(new Response('', { status: 401 }))],
      ['400', () => Promise.resolve(new Response('', { status: 400 }))],
      ['500', () => Promise.resolve(new Response('', { status: 500 }))],
      ['502', () => Promise.resolve(new Response('', { status: 502 }))],
    ]
    for (const [what, run] of other) {
      const error = await ask(run).catch((caught: unknown) => caught)
      expect(error, what).toBeInstanceOf(Error)
      expect(error, what).not.toBeInstanceOf(ScannerUnavailable)
    }
  })

  it('does not say so once the scan has begun: its events were sent, and then the line was cut', async () => {
    const encoder = new TextEncoder()
    const started = `${JSON.stringify({ type: 'event', event: { type: 'started', engines: [] } })}\n`
    let pulls = 0
    const fetcher: Fetcher = () =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            // The first line, and then a connection that fails as one refused would.
            pull(controller) {
              if (pulls++ === 0) controller.enqueue(encoder.encode(started))
              else controller.error(failed('ECONNREFUSED'))
            },
          }),
          { status: 200 },
        ),
      )
    const seen: unknown[] = []
    const error = await remoteScanner(
      'http://scanner:8788',
      TOKEN,
      fetcher,
    )({ url: 'https://example.com/' }, (event) => seen.push(event)).catch(
      (caught: unknown) => caught,
    )
    expect(seen).toHaveLength(1)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(ScannerUnavailable)
  })
})
