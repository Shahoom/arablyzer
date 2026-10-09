import { timingSafeEqual } from 'node:crypto'
import type { Crawler } from '@arablyzer/engine'
import {
  CRAWL_PATH,
  CrawlRequest,
  MAX_ERROR_LENGTH,
  SCAN_PATH,
  SCANNER_TIMEOUT_MS,
  ScanRequest,
  type Scanner,
  type ScannerEvent,
  type ScannerLineOut,
} from '@arablyzer/scanner-client'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { stream } from 'hono/streaming'

export interface ScannerDeps {
  /** The worker's token: the scanner answers no one else. */
  readonly token: string
  readonly scanner: Scanner
  /** Where a scan that could not run is told. */
  readonly log?: (message: string) => void
  /** How long a scan may run before it is stopped: as long as the worker waits for it. */
  readonly hardLimitMs?: number
  /** How long a scan told to stop has to let go of its browser. */
  readonly stopGraceMs?: number
  /**
   * A scan that did not stop when told holds the one scan the scanner runs, so no other can run
   * here: main.ts ends the process, and Compose starts it again.
   */
  readonly onStuck?: () => void
  /**
   * Given, a scan that started a browser or Lighthouse is the last of its process (M3 of the
   * pre-launch review): the browsers run without a sandbox of their own, in the process that holds
   * the worker's token and the CrUX key, so a renderer that a page took over could go on to forge
   * the reports of the scans after its own. When such a scan has ended, however it ended, this is
   * called: main.ts ends the process once the answer is out, and Compose starts it again clean.
   * Until then the scanner says it is restarting, to health and to any scan, and takes none. A
   * scan that started none has run no page's code in the process, and leaves it as it is.
   */
  readonly onBrowserUsed?: () => void
  /**
   * Reads pages for a deep crawl (M4.5): `POST /crawl`, one JSON answer. A page is read without
   * a browser, so it neither waits for the scan running nor ends the process after it; at most
   * `MAX_CRAWL_READS` run at once, and a scanner that is about to end its process takes none.
   */
  readonly crawler?: Crawler
}

/**
 * Whether a scan's step says a browser, or Lighthouse, is about to start: the engine sends it
 * before it launches one, and never launches one without it (its tests hold it to that). One that
 * then does not start, as when a browser is not there, counts too: better a process that ends
 * without need than one that runs on after a browser.
 */
const startsBrowser = (event: ScannerEvent) =>
  event.type === 'render-start' || event.type === 'lab-start'

/** A scan request is a URL: 8 KB is ample, and nothing larger is read. */
const MAX_BODY_BYTES = 8 * 1024
/** Pages a crawl reads here at once: reading one is light, but the scanner is not the crawl's alone. */
export const MAX_CRAWL_READS = 2
/** A crawl read that has not ended by now is stopped: a page's fetch, or a site's sitemaps. */
const CRAWL_READ_LIMIT_MS = 75_000
/** Ample: a scan told to stop let go of its browser in 286 ms (M2.1d review). */
const STOP_GRACE_MS = 30_000

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * The scanner's HTTP interface, for the worker alone (M2.1 plan §5b): one scan at a time, its
 * events and then its report as NDJSON. It holds no credential but the token it checks, and the
 * network it listens on reaches the worker alone. A worker that closes the connection stops the
 * scan, and so does the scan's own limit; one that will not stop makes the scanner unhealthy. It
 * is healthy when it can take a scan: once a scan has started a browser (`onBrowserUsed`), it is not.
 */
export function createScannerApp(deps: ScannerDeps): Hono {
  const expected = Buffer.from(`Bearer ${deps.token}`)
  const hardLimitMs = deps.hardLimitMs ?? SCANNER_TIMEOUT_MS
  const stopGraceMs = deps.stopGraceMs ?? STOP_GRACE_MS
  /** When the scan running started; null when none is. */
  let runningSince: number | null = null
  /** Whether a scan that started a browser has ended (`onBrowserUsed`): the scanner takes no other. */
  let retiring = false
  let reading = 0
  const app = new Hono()

  // Up, unless a scan has run past its limit, or a scan that started a browser has ended and the
  // process is about to end: Compose sees a scanner that is stuck, or one that is on its way out,
  // and not one that can take a scan.
  app.get('/health', (c) => {
    if (retiring) return c.text('restarting', 503)
    return runningSince !== null && Date.now() - runningSince > hardLimitMs
      ? c.text('stuck', 503)
      : c.text('ok')
  })

  app.post(
    SCAN_PATH,
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: 'bad-request' }, 400),
    }),
    async (c) => {
      const given = Buffer.from(c.req.header('authorization') ?? '')
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return c.json({ error: 'unauthorized' }, 401)
      }
      let raw: unknown
      try {
        raw = await c.req.json()
      } catch {
        return c.json({ error: 'bad-request' }, 400)
      }
      const request = ScanRequest.safeParse(raw)
      if (!request.success) return c.json({ error: 'bad-request' }, 400)
      // A scanner whose process is about to end takes no scan: the worker asks again, of the one
      // Compose starts (apps/worker).
      if (retiring) return c.json({ error: 'restarting' }, 503)
      // One scan at a time, one browser at a time (BUILD-PLAN §11): the worker takes one job.
      if (runningSince !== null) return c.json({ error: 'busy' }, 503)
      runningSince = Date.now()
      c.header('content-type', 'application/x-ndjson')
      // The process ends when the answer is out, if the scan starts a browser, and the connection
      // with it: an idle one would keep the server from closing until it timed out. Asked for
      // before the scan says whether it will: a connection is cheap.
      if (deps.onBrowserUsed !== undefined) c.header('connection', 'close')
      return stream(c, async (out) => {
        const stop = new AbortController()
        out.onAbort(() => {
          stop.abort()
        })
        const limit = setTimeout(() => {
          stop.abort(new Error(`The scan ran past its ${String(hardLimitMs)} ms`))
        }, hardLimitMs)
        const stuck = setTimeout(() => {
          deps.log?.('A scan did not stop when told: the scanner can take no other')
          deps.onStuck?.()
        }, hardLimitMs + stopGraceMs)
        const send = (line: ScannerLineOut) => out.write(`${JSON.stringify(line)}\n`)
        // Events keep their order: each is written after the one before it.
        let written: Promise<unknown> = Promise.resolve()
        // Whether the scan has started a browser or Lighthouse, by the steps it has sent.
        const seen = { browser: false }
        try {
          const report = await deps.scanner(
            request.data,
            (event) => {
              if (startsBrowser(event)) seen.browser = true
              written = written.then(() => send({ type: 'event', event })).catch(() => undefined)
            },
            stop.signal,
          )
          await written
          await send({ type: 'report', report })
        } catch (error) {
          await written
          deps.log?.(`A scan could not run: ${message(error)}`)
          await send({ type: 'error', message: message(error).slice(0, MAX_ERROR_LENGTH) })
        } finally {
          clearTimeout(limit)
          clearTimeout(stuck)
          runningSince = null
          if (seen.browser && deps.onBrowserUsed !== undefined) {
            retiring = true
            try {
              deps.onBrowserUsed()
            } catch (error) {
              deps.log?.(`The scanner could not end its process: ${message(error)}`)
            }
          }
        }
      })
    },
  )

  app.post(
    CRAWL_PATH,
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: 'bad-request' }, 400),
    }),
    async (c) => {
      const given = Buffer.from(c.req.header('authorization') ?? '')
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return c.json({ error: 'unauthorized' }, 401)
      }
      const { crawler } = deps
      if (crawler === undefined) return c.json({ error: 'not-found' }, 404)
      let raw: unknown
      try {
        raw = await c.req.json()
      } catch {
        return c.json({ error: 'bad-request' }, 400)
      }
      const request = CrawlRequest.safeParse(raw)
      if (!request.success) return c.json({ error: 'bad-request' }, 400)
      if (retiring || reading >= MAX_CRAWL_READS) return c.json({ error: 'busy' }, 503)
      reading++
      const stop = new AbortController()
      const limit = setTimeout(() => {
        stop.abort(new Error('The read ran past its limit'))
      }, CRAWL_READ_LIMIT_MS)
      try {
        const answer =
          request.data.op === 'page'
            ? await crawler.page(request.data.url, {
                signal: stop.signal,
                ...(request.data.anyOrigin === true ? { anyOrigin: true } : {}),
              })
            : await crawler.seeds(request.data.url, stop.signal)
        return c.json(answer)
      } catch (error) {
        deps.log?.(`A crawl read could not run: ${message(error)}`)
        return c.json({ error: 'failed' }, 500)
      } finally {
        clearTimeout(limit)
        reading--
      }
    },
  )

  return app
}
