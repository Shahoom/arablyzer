import { timingSafeEqual } from 'node:crypto'
import {
  MAX_ERROR_LENGTH,
  SCAN_PATH,
  SCANNER_TIMEOUT_MS,
  ScanRequest,
  type Scanner,
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
   * Given, the scanner serves one scan (M3 of the pre-launch review): its browsers run without a
   * sandbox of their own, in the process that holds the worker's token and the CrUX key, so a
   * renderer that a page took over could go on to forge the reports of the scans after its own.
   * When that scan has ended, however it ended, this is called: main.ts ends the process once the
   * answer is out, and Compose starts it again clean. Until then the scanner says it is
   * restarting, to health and to any scan, and takes none.
   */
  readonly onServed?: () => void
}

/** A scan request is a URL: 8 KB is ample, and nothing larger is read. */
const MAX_BODY_BYTES = 8 * 1024
/** Ample: a scan told to stop let go of its browser in 286 ms (M2.1d review). */
const STOP_GRACE_MS = 30_000

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * The scanner's HTTP interface, for the worker alone (M2.1 plan §5b): one scan at a time, its
 * events and then its report as NDJSON. It holds no credential but the token it checks, and the
 * network it listens on reaches the worker alone. A worker that closes the connection stops the
 * scan, and so does the scan's own limit; one that will not stop makes the scanner unhealthy. It
 * is healthy when it can take a scan: once it has served its one (`onServed`), it is not.
 */
export function createScannerApp(deps: ScannerDeps): Hono {
  const expected = Buffer.from(`Bearer ${deps.token}`)
  const hardLimitMs = deps.hardLimitMs ?? SCANNER_TIMEOUT_MS
  const stopGraceMs = deps.stopGraceMs ?? STOP_GRACE_MS
  /** When the scan running started; null when none is. */
  let runningSince: number | null = null
  /** Whether the one scan this scanner serves has ended (`onServed`): it takes no other. */
  let served = false
  const app = new Hono()

  // Up, unless a scan has run past its limit, or its one scan is served and its process is about
  // to end: Compose sees a scanner that is stuck, or one that is on its way out, and not one that
  // can take a scan.
  app.get('/health', (c) => {
    if (served) return c.text('restarting', 503)
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
      // A scanner that has served its scan takes none: the worker asks again, of the one Compose
      // starts (apps/worker).
      if (served) return c.json({ error: 'restarting' }, 503)
      // One scan at a time, one browser at a time (BUILD-PLAN §11): the worker takes one job.
      if (runningSince !== null) return c.json({ error: 'busy' }, 503)
      runningSince = Date.now()
      c.header('content-type', 'application/x-ndjson')
      // The process ends when the answer is out, and the connection with it: an idle one would
      // keep the server from closing until it timed out.
      if (deps.onServed !== undefined) c.header('connection', 'close')
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
        try {
          const report = await deps.scanner(
            request.data,
            (event) => {
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
          if (deps.onServed !== undefined) {
            served = true
            try {
              deps.onServed()
            } catch (error) {
              deps.log?.(`The scanner could not end its process: ${message(error)}`)
            }
          }
        }
      })
    },
  )

  return app
}
