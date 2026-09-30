import type { ScanEvent } from '@arablyzer/api-contract'
import { DEFAULT_MAX_REDIRECTS } from '@arablyzer/egress'
import { SCAN_BUDGET_MS as ENGINE_BUDGET_MS } from '@arablyzer/engine/budgets'
import rtlLayoutJson from '@arablyzer/fixtures/golden/reports/04-rtl-layout.json'
import { Report } from '@arablyzer/report-schema'
import {
  MAX_REDIRECTS,
  remoteScanner,
  SCAN_BUDGET_MS,
  ScannerUnavailable,
  type Scanner,
  type ScannerEvent,
} from '@arablyzer/scanner-client'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { createScannerApp } from '../src/app'

const TOKEN = 'a-token-long-enough-to-be-the-workers-own'
const REPORT = { scan: { status: 'complete' } } as unknown as Report
const EVENTS: ScannerEvent[] = [
  { type: 'started', engines: ['chromium'] },
  { type: 'page', status: 200, contentType: 'text/html', error: null },
  { type: 'rules', rules: 47 },
]

/**
 * The report a real scan gives is checked on the worker's side; a golden report passes that
 * check, and needs no engine loaded, which takes CI's machines longer than a test's 5 s.
 */
function validReport(): Promise<Report> {
  return Promise.resolve(Report.parse(rtlLayoutJson))
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
    const { client } = pair((request, onEvent) => {
      expect(request).toEqual({ url: 'https://example.com/' })
      for (const event of EVENTS) onEvent(event)
      return Promise.resolve(report)
    })
    const seen: ScanEvent[] = []
    const got = await client()({ url: 'https://example.com/' }, (event) => seen.push(event))
    expect(seen).toEqual(EVENTS)
    expect(got).toEqual(report)
  })

  it('answers no one without the worker token', async () => {
    const { app, client } = pair(() => Promise.resolve(REPORT))
    await expect(
      client('another-token-of-the-very-same-length-ok')(
        { url: 'https://example.com/' },
        () => undefined,
      ),
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
    const first = client()({ url: 'https://example.com/1' }, () => undefined)
    await new Promise((resolve) => setTimeout(resolve, 20))
    await expect(client()({ url: 'https://example.com/2' }, () => undefined)).rejects.toThrow(
      /answered 503/,
    )
    release()
    await expect(first).resolves.toEqual(report)
  })

  it('says why a scan could not run, and the client throws it', async () => {
    const { client } = pair(() => Promise.reject(new Error('Firefox did not start')))
    await expect(client()({ url: 'https://example.com/' }, () => undefined)).rejects.toThrow(
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
    await expect(
      client({ url: 'https://example.com/' }, (event) => seen.push(event)),
    ).rejects.toThrow(/protocol does not have/)
    expect(seen).toEqual([])
    // A report that is not one is refused as well.
    const bad = new Hono().post('/scan', (c) =>
      c.body(`${JSON.stringify({ type: 'report', report: { scan: 'nope' } })}\n`),
    )
    const badClient = remoteScanner('http://scanner:8788', TOKEN, (input, init) =>
      Promise.resolve(bad.request(input, init)),
    )
    await expect(badClient({ url: 'https://example.com/' }, () => undefined)).rejects.toThrow(
      /protocol does not have/,
    )
    // An answer that ends before its report is a scan that did not finish.
    const cut = new Hono().post('/scan', (c) =>
      c.body(`${JSON.stringify({ type: 'event', event: EVENTS[0] })}\n`),
    )
    const cutClient = remoteScanner('http://scanner:8788', TOKEN, (input, init) =>
      Promise.resolve(cut.request(input, init)),
    )
    await expect(cutClient({ url: 'https://example.com/' }, () => undefined)).rejects.toThrow(
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
        { url: 'https://example.com/' },
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
      // Wide enough apart that a machine busy with other suites keeps their order.
      hardLimitMs: 500,
      stopGraceMs: 1_000,
      onStuck: () => stuck.push('stuck'),
    })
    const response = await app.request('/scan', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/' }),
    })
    expect(response.status).toBe(200)
    expect((await app.request('/health')).status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 750))
    expect(given?.aborted).toBe(true)
    expect((await app.request('/health')).status).toBe(503)
    expect(stuck).toEqual([])
    await new Promise((resolve) => setTimeout(resolve, 1_000))
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

  // A scan reads robots.txt once for each site it asks for a page, so the events it may send
  // grow with the redirects its page follows.
  it("keeps the client's redirects the egress package's", () => {
    expect(MAX_REDIRECTS).toBe(DEFAULT_MAX_REDIRECTS)
  })
})

// M3 of the pre-launch review: a browser here runs without a sandbox of its own, in the process that
// holds the worker's token and the CrUX key, and a renderer that a page took over could go on to
// forge the reports of the scans after its own. So the scanner serves one scan, ends its process,
// and Compose starts it again clean (main.ts). It must say so honestly meanwhile.
describe('the scanner that serves one scan and ends its process (M3.1)', () => {
  /** The scanner app, that counts the times it asks for its process to end. */
  function serving(scanner: Scanner) {
    const served: string[] = []
    const app = createScannerApp({
      token: TOKEN,
      scanner,
      onServed: () => served.push('served'),
    })
    const client = (token = TOKEN) =>
      remoteScanner('http://scanner:8788', token, (input, init) =>
        Promise.resolve(app.request(input, init)),
      )
    const post = (body: string, token = TOKEN) =>
      app.request('/scan', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body,
      })
    return { app, client, served, post }
  }
  const PAGE = JSON.stringify({ url: 'https://example.com/' })

  it('is up, and takes a scan, until it has served one', async () => {
    const report = await validReport()
    const { app, client, served } = serving(() => Promise.resolve(report))
    expect(await (await app.request('/health')).text()).toBe('ok')
    expect(await client()({ url: 'https://example.com/' }, () => undefined)).toEqual(report)
    expect(served).toEqual(['served'])
  })

  it('asks for its process to end once, when the answer to the scan is complete', async () => {
    const report = await validReport()
    const served: string[] = []
    const app = createScannerApp({
      token: TOKEN,
      scanner: () => Promise.resolve(report),
      onServed: () => served.push('served'),
    })
    const response = await app.request('/scan', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}` },
      body: PAGE,
    })
    // The report is the last line of the answer, and the process is asked to end after it.
    const lines = (await response.text()).trim().split('\n')
    expect(lines.at(-1)).toContain('"type":"report"')
    expect(served).toEqual(['served'])
  })

  it('says it is restarting, to health and to a scan, once it has served one', async () => {
    const report = await validReport()
    const { app, client, served, post } = serving(() => Promise.resolve(report))
    await client()({ url: 'https://example.com/' }, () => undefined)
    const health = await app.request('/health')
    expect(health.status).toBe(503)
    expect(await health.text()).toBe('restarting')
    const refused = await post(PAGE)
    expect(refused.status).toBe(503)
    expect(await refused.json()).toEqual({ error: 'restarting' })
    // The worker reads that as a scanner that is not there yet, and asks again.
    await expect(client()({ url: 'https://example.com/' }, () => undefined)).rejects.toBeInstanceOf(
      ScannerUnavailable,
    )
    // It took none of them: the process is asked to end for the one scan it served.
    expect(served).toEqual(['served'])
  })

  it('serves one scan whatever becomes of it: one that failed is served too', async () => {
    const { app, client, served } = serving(() =>
      Promise.reject(new Error('Firefox did not start')),
    )
    await expect(client()({ url: 'https://example.com/' }, () => undefined)).rejects.toThrow(
      'Firefox did not start',
    )
    expect(served).toEqual(['served'])
    expect((await app.request('/health')).status).toBe(503)
  })

  it('serves one scan whatever becomes of it: one the worker hung up on is served too', async () => {
    let started: () => void = () => undefined
    const running = new Promise<void>((resolve) => {
      started = resolve
    })
    const served: string[] = []
    const app = createScannerApp({
      token: TOKEN,
      scanner: (_url, onEvent, signal) =>
        new Promise<Report>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new Error('Aborted'))
          })
          onEvent({ type: 'started', engines: ['chromium'] })
          started()
        }),
      onServed: () => served.push('served'),
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
        { url: 'https://example.com/' },
        () => {
          hangUp.abort()
        },
        hangUp.signal,
      )
      await running
      await expect(scanning).rejects.toThrow()
      await vi.waitFor(() => {
        expect(served).toEqual(['served'])
      })
      expect((await app.request('/health')).status).toBe(503)
    } finally {
      server?.close()
    }
  })

  it('does not count what ran no scan: the wrong token, a bad body, a scan turned away as busy', async () => {
    let release: () => void = () => undefined
    const report = await validReport()
    const { app, served, post } = serving(
      () =>
        new Promise<Report>((resolve) => {
          release = () => {
            resolve(report)
          }
        }),
    )
    expect((await post(PAGE, 'another-token-of-the-very-same-length-ok')).status).toBe(401)
    expect((await post('not json')).status).toBe(400)
    expect((await post(JSON.stringify({ url: '' }))).status).toBe(400)
    expect(served).toEqual([])
    expect((await app.request('/health')).status).toBe(200)
    // One is running: it is up while it runs, and another is turned away as busy.
    const first = post(PAGE)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect((await app.request('/health')).status).toBe(200)
    const busy = await post(PAGE)
    expect(busy.status).toBe(503)
    expect(await busy.json()).toEqual({ error: 'busy' })
    release()
    await (await first).text()
    expect(served).toEqual(['served'])
  })

  it('answers a scan asking for the connection to be closed, so its process can end when the answer is out', async () => {
    const report = await validReport()
    const { post } = serving(() => Promise.resolve(report))
    const response = await post(PAGE)
    expect(response.headers.get('connection')).toBe('close')
    await response.text()
  })

  it('takes any number of scans when nothing ends its process, as in `pnpm dev`', async () => {
    const report = await validReport()
    const { client } = pair(() => Promise.resolve(report))
    for (let scans = 0; scans < 3; scans++) {
      expect(await client()({ url: 'https://example.com/' }, () => undefined)).toEqual(report)
    }
  })
})
