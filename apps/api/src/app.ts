import {
  CreateScanRequest,
  SCAN_ID_PATTERN,
  TERMINAL_EVENTS,
  type ScanErrorCode,
  type ScanErrorResponse,
  type ScanEvent,
  type ScanSummary,
} from '@arablyzer/api-contract'
import type { EgressPolicy, Resolver } from '@arablyzer/egress'
import type { ScanLimits } from '@arablyzer/plans'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { streamSSE } from 'hono/streaming'
import {
  quietly,
  type RateLimiter,
  type ScanEvents,
  type ScanQueue,
  type ScanRecord,
  type ScanStore,
  type StoredEvent,
} from '@arablyzer/store'
import { hostKey, parseTarget, resolveTarget } from './target'
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
  /** How many event streams may be open at once, each holding a Valkey connection. */
  readonly streams?: StreamCaps
  /** Ends every open stream, so the server can stop without waiting for them (server.ts). */
  readonly shutdown?: AbortSignal
  /** Where a failure the visitor sees as 503 is told; never with the visitor's data. */
  readonly log?: (message: string) => void
}

export interface StreamCaps {
  /** On one scan: its page, open in a few tabs or on a few devices. */
  readonly perScan: number
  /** From one visitor, by their limit key. */
  readonly perVisitor: number
  /** In this process, within what Valkey's clients allow (10,000 by default). */
  readonly total: number
}

export const STREAM_CAPS: StreamCaps = { perScan: 8, perVisitor: 8, total: 1000 }
/** When a page refused a stream may try again. */
const STREAM_RETRY_SECONDS = 30

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
  const caps = deps.streams ?? STREAM_CAPS
  const failure = quietly('API', deps.log)
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
      if (!(await deps.turnstile(request.data.turnstileToken))) {
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
        `host:${hostKey(parsed.value.host)}`,
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
      try {
        await deps.events.publish(id, { type: 'queued', ahead })
        await deps.queue.add({ id, url: resolved.value })
      } catch (error) {
        // Never queued, so never run: the scan fails at once, and says so to any page it has.
        await deps.store.fail(id, at).catch(() => false)
        await deps.events.publish(id, { type: 'error' }).catch(() => '')
        throw error
      }
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

  /** The streams open now, counted per scan and per visitor, released as each ends. */
  const open = { total: 0, scans: new Map<string, number>(), visitors: new Map<string, number>() }
  const count = (map: Map<string, number>, key: string | null, by: 1 | -1) => {
    if (key === null) return
    const next = (map.get(key) ?? 0) + by
    if (next > 0) map.set(key, next)
    else map.delete(key)
  }

  app.get('/api/scans/:id/events', async (c) => {
    const scan = await findScan(c.req.param('id'))
    if (scan === null) return c.notFound()
    const last = c.req.header('last-event-id')?.trim()
    const after = last !== undefined && EVENT_ID.test(last) ? last : null

    // A scan that has ended needs no waiting and no connection of its own: the events the page
    // has not seen, and its end; nothing at all, 204, for a page that has seen them all.
    if (isFinished(scan.state)) {
      const rest = await deps.events.since(scan.id, after)
      if (rest.length === 0 && after !== null) return c.body(null, 204)
      return streamSSE(c, async (stream) => {
        for (const stored of rest) {
          await stream.writeSSE({ id: stored.id, data: JSON.stringify(stored.event) })
        }
        if (!rest.some((stored) => isTerminal(stored.event))) {
          await stream.writeSSE({ data: JSON.stringify(endOf(scan)) })
        }
      })
    }

    const address = deps.address(c)
    const visitor = address === null ? null : deps.connectionKey(address, now())
    if (
      open.total >= caps.total ||
      (open.scans.get(scan.id) ?? 0) >= caps.perScan ||
      (visitor !== null && (open.visitors.get(visitor) ?? 0) >= caps.perVisitor)
    ) {
      return refuse(c, 'rate-limited', STREAM_RETRY_SECONDS)
    }
    open.total++
    count(open.scans, scan.id, 1)
    count(open.visitors, visitor, 1)
    // Proxies must pass the stream on as it comes.
    c.header('X-Accel-Buffering', 'no')
    return streamSSE(c, async (stream) => {
      const stop = new AbortController()
      const end = () => {
        stop.abort()
      }
      stream.onAbort(end)
      deps.shutdown?.addEventListener('abort', end, { once: true })
      const timer = setTimeout(end, deps.streamMs ?? 5 * 60_000)
      let seen = after
      /** Sends one event; true when it was the scan's end. */
      const send = async (stored: StoredEvent) => {
        seen = stored.id
        await stream.writeSSE({ id: stored.id, data: JSON.stringify(stored.event) })
        return isTerminal(stored.event)
      }
      try {
        if (deps.shutdown?.aborted === true) return
        for await (const stored of deps.events.follow(scan.id, after, stop.signal)) {
          if (stored !== null) {
            if (await send(stored)) break
            continue
          }
          // Nothing new: a comment keeps the connection, and asks if the scan ended unseen.
          await stream.write(': keep-alive\n\n')
          const current = await deps.store.get(scan.id)
          if (current === null || !isFinished(current.state)) continue
          // It ended: first the events still unread, its real end among them if it came late,
          // and only without one, the end its state says.
          let ended = false
          for (const rest of await deps.events.since(scan.id, seen)) {
            if (await send(rest)) {
              ended = true
              break
            }
          }
          if (!ended) await stream.writeSSE({ data: JSON.stringify(endOf(current)) })
          break
        }
      } finally {
        clearTimeout(timer)
        deps.shutdown?.removeEventListener('abort', end)
        stop.abort()
        open.total--
        count(open.scans, scan.id, -1)
        count(open.visitors, visitor, -1)
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
  // A store that fails (Valkey or PostgreSQL away) is the service being unavailable, said as
  // the page reads it, and told once in a while in the log.
  app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse()
    failure(error)
    return refuse(c, 'unavailable')
  })

  async function findScan(id: string) {
    return SCAN_ID_PATTERN.test(id) ? deps.store.get(id) : null
  }

  return app
}

function isFinished(state: string): state is 'complete' | 'partial' | 'failed' {
  return state === 'complete' || state === 'partial' || state === 'failed'
}

function isTerminal(event: ScanEvent): boolean {
  return TERMINAL_EVENTS.includes(event.type)
}

/** The end a finished scan's state says: `error` for one that could not run, else `done`. */
function endOf(scan: ScanRecord): ScanEvent {
  if (scan.state === 'failed' && scan.report === null) return { type: 'error' }
  return { type: 'done', state: isFinished(scan.state) ? scan.state : 'failed' }
}
