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
// forge the reports of the scans after its own. So a scan that started a browser (or Lighthouse) is
// the last of its process: the scanner ends it, and Compose starts it again clean (main.ts). A scan
// that started none has run no page's code in the process, and leaves it as it is. The scanner must
// say which it is, honestly, meanwhile.
describe('the scanner that ends its process after a scan that started a browser (M3)', () => {
  /** What the engine sends before it launches a browser, and before Lighthouse. */
  const BROWSER: ScannerEvent = { type: 'render-start', engine: 'chromium' }
  const LIGHTHOUSE: ScannerEvent = { type: 'lab-start' }
  /** The steps of a scan that starts none: the page, and the rules. */
  const BEGUN: ScannerEvent = { type: 'started', engines: ['chromium'] }
  const PLAIN: ScannerEvent[] = [
    BEGUN,
    { type: 'page', status: 200, contentType: 'text/html', error: null },
    { type: 'rules', rules: 47 },
  ]

  /** A scan that sends these steps, and then gives its report. */
  const saying =
    (...events: ScannerEvent[]): Scanner =>
    async (_request, onEvent) => {
      for (const event of events) onEvent(event)
      return validReport()
    }

  /** The scanner app, that counts the times it asks for its process to end. */
  function serving(scanner: Scanner) {
    const ended: string[] = []
    const app = createScannerApp({
      token: TOKEN,
      scanner,
      onBrowserUsed: () => ended.push('ended'),
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
    return { app, client, ended, post }
  }
  const PAGE = JSON.stringify({ url: 'https://example.com/' })
  const ask = (client: ReturnType<typeof serving>['client']) =>
    client()({ url: 'https://example.com/' }, () => undefined)

  it.each([
    ['a browser', BROWSER],
    ['Lighthouse', LIGHTHOUSE],
  ])('is up, and takes a scan, until it has served one that started %s', async (_what, start) => {
    const report = await validReport()
    const { app, client, ended } = serving(saying(...PLAIN, start))
    expect(await (await app.request('/health')).text()).toBe('ok')
    expect(await ask(client)).toEqual(report)
    expect(ended).toEqual(['ended'])
  })

  it('leaves its process as it is after a scan that started neither, and takes the next', async () => {
    const report = await validReport()
    const { app, client, ended } = serving(saying(...PLAIN))
    for (let scans = 0; scans < 3; scans++) {
      expect(await ask(client), `scan ${String(scans + 1)}`).toEqual(report)
      expect(await (await app.request('/health')).text()).toBe('ok')
    }
    expect(ended).toEqual([])
  })

  it('leaves its process as it is after a scan that failed before it started a browser', async () => {
    const { app, client, ended } = serving((_request, onEvent) => {
      onEvent(BEGUN)
      return Promise.reject(new Error('The page could not be read'))
    })
    await expect(ask(client)).rejects.toThrow('The page could not be read')
    expect(ended).toEqual([])
    expect((await app.request('/health')).status).toBe(200)
    // And another scan is taken.
    await expect(ask(client)).rejects.toThrow('The page could not be read')
  })

  it('asks for its process to end once, when the answer to the scan is complete', async () => {
    const report = await validReport()
    const ended: string[] = []
    const app = createScannerApp({
      token: TOKEN,
      scanner: saying(BROWSER),
      onBrowserUsed: () => ended.push('ended'),
    })
    const response = await app.request('/scan', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}` },
      body: PAGE,
    })
    // The report is the last line of the answer, and the process is asked to end after it.
    const lines = (await response.text()).trim().split('\n')
    expect(JSON.parse(lines.at(-1) ?? '')).toMatchObject({ type: 'report', report })
    expect(ended).toEqual(['ended'])
  })

  it('says it is restarting, to health and to a scan, once a browser scan has been served', async () => {
    const { app, client, ended, post } = serving(saying(BROWSER))
    await ask(client)
    const health = await app.request('/health')
    expect(health.status).toBe(503)
    expect(await health.text()).toBe('restarting')
    const refused = await post(PAGE)
    expect(refused.status).toBe(503)
    expect(await refused.json()).toEqual({ error: 'restarting' })
    // The worker reads that as a scanner that is not there yet, and asks again.
    await expect(ask(client)).rejects.toBeInstanceOf(ScannerUnavailable)
    // It took none of them: the process is asked to end for the one scan it served.
    expect(ended).toEqual(['ended'])
  })

  it('counts a scan that started a browser and failed: a browser may have run', async () => {
    const { app, client, ended } = serving((_request, onEvent) => {
      onEvent(BROWSER)
      return Promise.reject(new Error('Firefox did not start'))
    })
    await expect(ask(client)).rejects.toThrow('Firefox did not start')
    expect(ended).toEqual(['ended'])
    expect((await app.request('/health')).status).toBe(503)
  })

  /**
   * A scan that sends these steps and then goes on, until the worker hangs up on it, over a real
   * connection; the scanner app, what it asked for, and a way to close its server.
   */
  async function hungUpOn(...events: ScannerEvent[]) {
    let started: () => void = () => undefined
    const running = new Promise<void>((resolve) => {
      started = resolve
    })
    const ended: string[] = []
    const app = createScannerApp({
      token: TOKEN,
      scanner: (_url, onEvent, signal) =>
        new Promise<Report>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new Error('Aborted'))
          })
          for (const event of events) onEvent(event)
          started()
        }),
      onBrowserUsed: () => ended.push('ended'),
    })
    let server: ReturnType<typeof serve> | undefined
    const port = await new Promise<number>((resolve) => {
      server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
        resolve(info.port)
      })
    })
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
    return {
      app,
      ended,
      close: () => {
        server?.close()
      },
    }
  }

  it('counts a browser scan that the worker hung up on: the browser may be running', async () => {
    const { app, ended, close } = await hungUpOn(BEGUN, BROWSER)
    try {
      await vi.waitFor(() => {
        expect(ended).toEqual(['ended'])
      })
      expect((await app.request('/health')).status).toBe(503)
    } finally {
      close()
    }
  })

  it('does not count a scan that the worker hung up on before it started a browser', async () => {
    const { app, ended, close } = await hungUpOn(...PLAIN)
    try {
      // Time for the scanner to learn the worker is gone, and to end the scan.
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(ended).toEqual([])
      expect((await app.request('/health')).status).toBe(200)
    } finally {
      close()
    }
  })

  it('does not count what ran no scan: the wrong token, a bad body, a scan turned away as busy', async () => {
    let release: () => void = () => undefined
    const report = await validReport()
    const { app, ended, post } = serving((_request, onEvent) => {
      onEvent(BROWSER)
      return new Promise<Report>((resolve) => {
        release = () => {
          resolve(report)
        }
      })
    })
    expect((await post(PAGE, 'another-token-of-the-very-same-length-ok')).status).toBe(401)
    expect((await post('not json')).status).toBe(400)
    expect((await post(JSON.stringify({ url: '' }))).status).toBe(400)
    expect(ended).toEqual([])
    expect((await app.request('/health')).status).toBe(200)
    // One is running, with a browser: it is up while it runs, and another is turned away as busy.
    const first = post(PAGE)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect((await app.request('/health')).status).toBe(200)
    const busy = await post(PAGE)
    expect(busy.status).toBe(503)
    expect(await busy.json()).toEqual({ error: 'busy' })
    expect(ended).toEqual([])
    release()
    await (await first).text()
    expect(ended).toEqual(['ended'])
  })

  it('answers every scan asking for the connection to be closed: it is not yet known whether the process will end', async () => {
    const { post } = serving(saying(...PLAIN))
    const response = await post(PAGE)
    expect(response.headers.get('connection')).toBe('close')
    await response.text()
  })

  it('takes any number of scans when nothing ends its process, as in `pnpm dev`', async () => {
    const report = await validReport()
    // Whatever the scans start: this app was not given a way to end its process.
    const { client } = pair(saying(BROWSER, LIGHTHOUSE))
    for (let scans = 0; scans < 3; scans++) {
      expect(await ask(client), `scan ${String(scans + 1)}`).toEqual(report)
    }
  })
})
