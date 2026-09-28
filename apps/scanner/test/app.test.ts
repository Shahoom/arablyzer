import type { ScanEvent } from '@arablyzer/api-contract'
import { SCAN_BUDGET_MS as ENGINE_BUDGET_MS } from '@arablyzer/engine/budgets'
import type { Report } from '@arablyzer/report-schema'
import {
  remoteScanner,
  SCAN_BUDGET_MS,
  type Scanner,
  type ScannerEvent,
} from '@arablyzer/scanner-client'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createScannerApp } from '../src/app'

const TOKEN = 'a-token-long-enough-to-be-the-workers-own'
const REPORT = { scan: { status: 'complete' } } as unknown as Report
const EVENTS: ScannerEvent[] = [
  { type: 'started', engines: ['chromium'] },
  { type: 'page', status: 200, contentType: 'text/html', error: null },
  { type: 'rules', rules: 47 },
]

/** The report a real scan gives is checked on the worker's side; this one passes that check. */
async function validReport(): Promise<Report> {
  const { scan } = await import('@arablyzer/engine')
  return scan('http://10.0.0.1/', { rules: [] })
}

/** The scanner app, and a client of it that talks to it through app.request. */
function pair(scanner: Scanner) {
  const app = createScannerApp({ token: TOKEN, scanner })
  const client = (token = TOKEN) =>
    remoteScanner('http://scanner:8788', token, (input, init) =>
      Promise.resolve(app.request(input, init)),
    )
  return { app, client }
}

describe('the scanner and its client', () => {
  it('answers with the scan events, in order, then the report', async () => {
    const report = await validReport()
    const { client } = pair((url, onEvent) => {
      expect(url).toBe('https://example.com/')
      for (const event of EVENTS) onEvent(event)
      return Promise.resolve(report)
    })
    const seen: ScanEvent[] = []
    const got = await client()('https://example.com/', (event) => seen.push(event))
    expect(seen).toEqual(EVENTS)
    expect(got).toEqual(report)
  })

  it('answers no one without the worker token', async () => {
    const { app, client } = pair(() => Promise.resolve(REPORT))
    await expect(
      client('another-token-of-the-very-same-length-ok')('https://example.com/', () => undefined),
    ).rejects.toThrow(/answered 401/)
    const unsigned = await app.request('/scan', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/' }),
    })
    expect(unsigned.status).toBe(401)
  })

  it('refuses a body that is not a scan request', async () => {
    const { app } = pair(() => Promise.resolve(REPORT))
    const ask = (body: string) =>
      app.request('/scan', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body })
    expect((await ask('not json')).status).toBe(400)
    expect((await ask(JSON.stringify({ url: '' }))).status).toBe(400)
    expect((await ask(JSON.stringify({ url: 'https://example.com/', who: 'x' }))).status).toBe(400)
    expect((await ask(JSON.stringify({ url: 'x'.repeat(9000) }))).status).toBe(400)
  })

  it('runs one scan at a time', async () => {
    let release: () => void = () => undefined
    const report = await validReport()
    const { client } = pair(
      () =>
        new Promise<Report>((resolve) => {
          release = () => {
            resolve(report)
          }
        }),
    )
    const first = client()('https://example.com/1', () => undefined)
    await new Promise((resolve) => setTimeout(resolve, 20))
    await expect(client()('https://example.com/2', () => undefined)).rejects.toThrow(/answered 503/)
    release()
    await expect(first).resolves.toEqual(report)
  })

  it('says why a scan could not run, and the client throws it', async () => {
    const { client } = pair(() => Promise.reject(new Error('Firefox did not start')))
    await expect(client()('https://example.com/', () => undefined)).rejects.toThrow(
      'The scanner could not run the scan: Firefox did not start',
    )
  })

  it('takes nothing from a scanner that sends what its protocol does not have', async () => {
    const forged = new Hono().post('/scan', (c) =>
      c.body(
        [
          JSON.stringify({ type: 'event', event: { type: 'teapot' } }),
          JSON.stringify({ type: 'report', report: REPORT }),
        ].join('\n'),
      ),
    )
    const seen: ScanEvent[] = []
    const client = remoteScanner('http://scanner:8788', TOKEN, (input, init) =>
      Promise.resolve(forged.request(input, init)),
    )
    await expect(client('https://example.com/', (event) => seen.push(event))).rejects.toThrow(
      /protocol does not have/,
    )
    expect(seen).toEqual([])
    // A report that is not one is refused as well.
    const bad = new Hono().post('/scan', (c) =>
      c.body(`${JSON.stringify({ type: 'report', report: { scan: 'nope' } })}\n`),
    )
    const badClient = remoteScanner('http://scanner:8788', TOKEN, (input, init) =>
      Promise.resolve(bad.request(input, init)),
    )
    await expect(badClient('https://example.com/', () => undefined)).rejects.toThrow(
      /protocol does not have/,
    )
    // An answer that ends before its report is a scan that did not finish.
    const cut = new Hono().post('/scan', (c) =>
      c.body(`${JSON.stringify({ type: 'event', event: EVENTS[0] })}\n`),
    )
    const cutClient = remoteScanner('http://scanner:8788', TOKEN, (input, init) =>
      Promise.resolve(cut.request(input, init)),
    )
    await expect(cutClient('https://example.com/', () => undefined)).rejects.toThrow(
      /without a report/,
    )
  })

  it('stops the scan when the worker hangs up, on a real connection', async () => {
    let started: () => void = () => undefined
    const running = new Promise<void>((resolve) => {
      started = resolve
    })
    let stopped: () => void = () => undefined
    const stopping = new Promise<void>((resolve) => {
      stopped = resolve
    })
    const app = createScannerApp({
      token: TOKEN,
      scanner: (_url, onEvent, signal) => {
        signal?.addEventListener('abort', () => {
          stopped()
        })
        onEvent({ type: 'started', engines: ['chromium'] })
        started()
        // A render that would go on, but for the signal.
        return new Promise<Report>(() => undefined)
      },
    })
    let server: ReturnType<typeof serve> | undefined
    const port = await new Promise<number>((resolve) => {
      server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
        resolve(info.port)
      })
    })
    try {
      const hangUp = new AbortController()
      const scanning = remoteScanner(`http://127.0.0.1:${String(port)}`, TOKEN)(
        'https://example.com/',
        () => {
          hangUp.abort()
        },
        hangUp.signal,
      )
      await running
      await expect(scanning).rejects.toThrow()
      await stopping
    } finally {
      server?.close()
    }
  })

  it('stops a scan past its limit, and is unhealthy while one will not stop', async () => {
    let given: AbortSignal | undefined
    const stuck: string[] = []
    const app = createScannerApp({
      token: TOKEN,
      // A scan that neither ends nor listens to its signal.
      scanner: (_url, _onEvent, signal) => {
        given = signal
        return new Promise<Report>(() => undefined)
      },
      hardLimitMs: 50,
      stopGraceMs: 50,
      onStuck: () => stuck.push('stuck'),
    })
    const response = await app.request('/scan', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/' }),
    })
    expect(response.status).toBe(200)
    expect((await app.request('/health')).status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 75))
    expect(given?.aborted).toBe(true)
    expect((await app.request('/health')).status).toBe(503)
    expect(stuck).toEqual([])
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(stuck).toEqual(['stuck'])
  })

  it('says it is up, to Compose, without the token', async () => {
    const { app } = pair(() => Promise.resolve(REPORT))
    const response = await app.request('/health')
    expect(response.status).toBe(200)
  })

  it("keeps the client's budget the engine's", () => {
    expect(SCAN_BUDGET_MS).toBe(ENGINE_BUDGET_MS)
  })
})
