import { describe, expect, it } from 'vitest'
import { MAX_SCANNER_EVENTS, remoteScanner, type Fetcher } from '../src/index'

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
      remoteScanner('http://scanner:8788', TOKEN, fetcher)('https://example.com/', () => undefined),
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
      )('https://example.com/', (event) => seen.push(event)),
    ).rejects.toThrow('The scanner could not run the scan: تعذّر تشغيل المتصفح')
    expect(seen).toEqual([{ type: 'started', engines: [] }])
  })

  it("takes a scan's own steps, each once and the render's for every engine", async () => {
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
    const events = [
      { type: 'started', engines: ['chromium', 'firefox', 'webkit'] },
      { type: 'page', status: 200, contentType: 'text/html', error: null },
      { type: 'robots', outcome: 'fetched', status: 200 },
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
      )('https://example.com/', (event) => seen.push(event)),
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
        )('https://example.com/', (seenEvent) => seen.push(seenEvent)),
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
      )('https://example.com/', (event) => seen.push(event)),
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
      )('https://example.com/', () => undefined),
    ).rejects.toThrow(/too long/)
    const busy = answering(['{"error":"busy"}'], 503)
    await expect(
      remoteScanner(
        'http://scanner:8788',
        TOKEN,
        busy.fetcher,
      )('https://example.com/', () => undefined),
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
      )('https://example.com/', () => undefined),
    ).rejects.toThrow('aborted')
  })
})
