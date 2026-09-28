import { timingSafeEqual } from 'node:crypto'
import {
  MAX_ERROR_LENGTH,
  SCAN_PATH,
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
}

/** A scan request is a URL: 8 KB is ample, and nothing larger is read. */
const MAX_BODY_BYTES = 8 * 1024

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * The scanner's HTTP interface, for the worker alone (M2.1 plan §5b): one scan at a time, its
 * events and then its report as NDJSON. It holds no credential but the token it checks, and the
 * network it listens on reaches the worker alone. A page that closes the connection stops the
 * scan.
 */
export function createScannerApp(deps: ScannerDeps): Hono {
  const expected = Buffer.from(`Bearer ${deps.token}`)
  let busy = false
  const app = new Hono()

  app.get('/health', (c) => c.text('ok'))

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
      // One scan at a time, one browser at a time (BUILD-PLAN §11): the worker takes one job.
      if (busy) return c.json({ error: 'busy' }, 503)
      busy = true
      c.header('content-type', 'application/x-ndjson')
      return stream(c, async (out) => {
        const stop = new AbortController()
        out.onAbort(() => {
          stop.abort()
        })
        const send = (line: ScannerLineOut) => out.write(`${JSON.stringify(line)}\n`)
        // Events keep their order: each is written after the one before it.
        let written: Promise<unknown> = Promise.resolve()
        try {
          const report = await deps.scanner(
            request.data.url,
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
          busy = false
        }
      })
    },
  )

  return app
}
