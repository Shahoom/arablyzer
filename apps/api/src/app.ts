import {
  CreateScanRequest,
  SCAN_ID_PATTERN,
  TERMINAL_EVENTS,
  type ScanErrorCode,
  type ScanErrorResponse,
  type ScanSummary,
} from '@arablyzer/api-contract'
import type { EgressPolicy, Resolver } from '@arablyzer/egress'
import type { ScanLimits } from '@arablyzer/plans'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { streamSSE } from 'hono/streaming'
import type { RateLimiter, ScanEvents, ScanQueue, ScanStore } from '@arablyzer/store'
import { parseTarget, resolveTarget } from './target'
import type { TurnstileCheck } from './turnstile'

export interface ApiDeps {
  readonly limits: ScanLimits
  /** The scan's address rules: private, loopback, metadata and the server's own refused. */
  readonly policy: EgressPolicy
  readonly resolver: Resolver
  readonly turnstile: TurnstileCheck
  readonly limiter: RateLimiter
  readonly store: ScanStore
  readonly queue: ScanQueue
  readonly events: ScanEvents
  /** The visitor's address, where the deployment trusts it from; null when it has none. */
  readonly address: (c: Context) => string | null
  /** The limiter's key for an address, which is never the address itself (§14). */
  readonly connectionKey: (address: string, now: Date) => string
  readonly newId: () => string
  readonly now?: () => Date
  /** How long a scan's event stream stays open before the page reconnects. */
  readonly streamMs?: number
}

/** A scan request is a URL and a token: 8 KB is ample, and nothing larger is read. */
const MAX_BODY_BYTES = 8 * 1024
/** A Last-Event-ID the stores could have given: short, digits and dashes. */
const EVENT_ID = /^[0-9-]{1,40}$/

const STATUS: Readonly<Record<ScanErrorCode, 400 | 403 | 422 | 429 | 503>> = {
  'bad-request': 400,
  'invalid-url': 400,
  'unsupported-scheme': 400,
  'url-too-long': 400,
  'credentials-in-url': 400,
  'port-not-allowed': 400,
  'blocked-host': 422,
  'blocked-address': 422,
  'dns-failed': 422,
  'turnstile-failed': 403,
  'rate-limited': 429,
  unavailable: 503,
}

/** The scan API (M2.1 plan §4): its routes on the stores it is given. */
export function createApp(deps: ApiDeps): Hono {
  const now = deps.now ?? (() => new Date())
  const app = new Hono()

  // The API is not content: never indexed, never sniffed, and it sends no referrer.
  app.use('*', async (c, next) => {
    await next()
    c.header('X-Robots-Tag', 'noindex, nofollow')
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'no-referrer')
    c.header('Cache-Control', 'no-store')
  })

  const refuse = (c: Context, error: ScanErrorCode, retryAfterSeconds?: number) => {
    const body: ScanErrorResponse =
      retryAfterSeconds === undefined ? { error } : { error, retryAfterSeconds }
    if (retryAfterSeconds !== undefined) c.header('Retry-After', String(retryAfterSeconds))
    return c.json(body, STATUS[error])
  }

  app.post(
    '/api/scans',
    bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => refuse(c, 'bad-request') }),
    async (c) => {
      let raw: unknown
      try {
        raw = await c.req.json()
      } catch {
        return refuse(c, 'bad-request')
      }
      const request = CreateScanRequest.safeParse(raw)
      if (!request.success) return refuse(c, 'bad-request')

      // What needs no network first; the checks that cost something come after Turnstile and
      // the visitor's own limit, so the API cannot be used to look up names or fill the queue.
      const parsed = parseTarget(request.data.url, deps.policy)
      if (!parsed.ok) return refuse(c, parsed.code)
      // Without the visitor's address there is no limit to keep, so there is no scan.
      const address = deps.address(c)
      if (address === null) return refuse(c, 'unavailable')
      if (!(await deps.turnstile(request.data.turnstileToken, address))) {
        return refuse(c, 'turnstile-failed')
      }
      const at = now()
      const own = await deps.limiter.take(
        `connection:${deps.connectionKey(address, at)}`,
        deps.limits.perConnection,
        at.getTime(),
      )
      if (!own.ok) return refuse(c, 'rate-limited', own.retryAfterSeconds)
      const resolved = await resolveTarget(parsed.value, deps.policy, deps.resolver)
      if (!resolved.ok) return refuse(c, resolved.code)
      const host = await deps.limiter.take(
        `host:${parsed.value.host}`,
        deps.limits.perHost,
        at.getTime(),
      )
      if (!host.ok) return refuse(c, 'rate-limited', host.retryAfterSeconds)
      const ahead = await deps.queue.waiting()
      if (ahead >= deps.limits.queue) return refuse(c, 'unavailable')

      // Stored and announced before it is queued, so the worker never starts a scan whose
      // record or first event is not there yet.
      const id = deps.newId()
      await deps.store.create({ id, url: resolved.value, createdAt: at })
      await deps.events.publish(id, { type: 'queued', ahead })
      await deps.queue.add({ id, url: resolved.value })
      return c.json({ id }, 202)
    },
  )

  app.get('/api/scans/:id', async (c) => {
    const scan = await findScan(c.req.param('id'))
    if (scan === null) return c.notFound()
    const summary: ScanSummary = {
      id: scan.id,
      url: scan.url,
      state: scan.state,
      createdAt: scan.createdAt.toISOString(),
    }
    return c.json(summary)
  })

  app.get('/api/scans/:id/events', async (c) => {
    const scan = await findScan(c.req.param('id'))
    if (scan === null) return c.notFound()
    const last = c.req.header('last-event-id')?.trim()
    const after = last !== undefined && EVENT_ID.test(last) ? last : null
    // Proxies must pass the stream on as it comes.
    c.header('X-Accel-Buffering', 'no')
    return streamSSE(c, async (stream) => {
      const stop = new AbortController()
      stream.onAbort(() => {
        stop.abort()
      })
      const timer = setTimeout(
        () => {
          stop.abort()
        },
        deps.streamMs ?? 5 * 60_000,
      )
      try {
        for await (const stored of deps.events.follow(scan.id, after, stop.signal)) {
          if (stored === null) {
            // Nothing new: a comment keeps the connection, and asks if the scan ended unseen.
            await stream.write(': keep-alive\n\n')
            const current = await deps.store.get(scan.id)
            if (current !== null && isFinished(current.state)) {
              await stream.writeSSE({
                data: JSON.stringify({ type: 'done', state: current.state }),
              })
              break
            }
            continue
          }
          await stream.writeSSE({ id: stored.id, data: JSON.stringify(stored.event) })
          if (TERMINAL_EVENTS.includes(stored.event.type)) break
        }
      } finally {
        clearTimeout(timer)
        stop.abort()
      }
    })
  })

  app.get('/api/reports/:id', async (c) => {
    const scan = await findScan(c.req.param('id'))
    if (scan === null) return c.notFound()
    if (scan.report === null) {
      return c.json({ state: scan.state }, scan.state === 'failed' ? 404 : 409)
    }
    return c.json(scan.report)
  })

  app.notFound((c) => c.json({ error: 'not-found' }, 404))

  async function findScan(id: string) {
    return SCAN_ID_PATTERN.test(id) ? deps.store.get(id) : null
  }

  return app
}

function isFinished(state: string): state is 'complete' | 'partial' | 'failed' {
  return state === 'complete' || state === 'partial' || state === 'failed'
}
