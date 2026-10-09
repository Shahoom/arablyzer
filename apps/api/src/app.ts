import {
  CreateScanRequest,
  DELETE_TOKEN_PATTERN,
  SCAN_ID_PATTERN,
  TERMINAL_EVENTS,
  type ScanErrorCode,
  type CreateScanResponse,
  type ScanErrorResponse,
  type ScanEvent,
  type ScanSummary,
} from '@arablyzer/api-contract'
import type { EgressPolicy, Resolver } from '@arablyzer/egress'
import type { ScanLimits } from '@arablyzer/plans'
import { toolDefinition } from '@arablyzer/tools/registry'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { streamSSE, type SSEStreamingApi } from 'hono/streaming'
import {
  hostLimitKey,
  quietly,
  type InFlight,
  type RateLimiter,
  type ScanEvents,
  type ScanQueue,
  type ScanRecord,
  type ScanStore,
  type StoredEvent,
} from '@arablyzer/store'
import { registerFontRoutes, type FontContext } from './fonts'
import { mountAccounts, planOf, type AccountsDeps, type AccountUser } from './accounts'
import { fromTheSite } from './guards'
import { registerGscRoutes, type GscDeps } from './gsc/routes'
import { hashDeleteToken, newDeleteToken } from './ids'
import { mountCrawls } from './crawls'
import { mountMonitors } from './monitors'
import { noMailer } from './monitor/mail'
import { mountSites } from './sites'
import { holdPlace } from './places'
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
  /** The scans each visitor has queued or running, so no one visitor fills the queue. */
  readonly inFlight: InFlight
  /** The visitor's address, where the deployment trusts it from; null when it has none. */
  readonly address: (c: Context) => string | null
  /** The limiter's key for an address, which is never the address itself (§14). */
  readonly connectionKey: (address: string, now: Date) => string
  /**
   * The key of the network the address is in, whose visitors are counted together (an IPv6 /32);
   * null for an address in none. Without it there is no network limit, as in tests.
   */
  readonly networkKey?: (address: string, now: Date) => string | null
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
  /**
   * The site's origin (ARABLYZER_SITE), which a request to start a scan must come from. Without
   * it, as in development, where the site is served from anywhere, none is asked.
   */
  readonly origin?: string
  /** Accounts (M4.1); absent, the feature is off and every route of it is a 404. */
  readonly accounts?: AccountsDeps
  /** Search Console, connected from a report; absent, the feature is off (gsc/routes.ts). */
  readonly gsc?: GscDeps
  /** Another way to fetch the font files of the font slimmer's downloads; tests pass their own. */
  readonly fontFetcher?: FontContext['fetcher']
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
/** What a page is told of a stream that failed: the word, never the store's message. */
const STREAM_FAILURE = 'unavailable'

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
  const foreign = quietly('API', deps.log)
  const streamFailure = quietly('API events', deps.log)
  const app = new Hono()

  /**
   * An event stream. Left alone, Hono prints a stream that fails with console.error, the whole
   * error and whatever it holds, which for a store's client can be the URL it connects with, and
   * the password in it (security review, issue #30). Here it is told by its message alone, once
   * in a while, as every other failure of the API is. Hono then sends the error's message to the
   * page as an `error` event: a fixed word goes instead, never a store's own words (a host, a
   * port, a user name). What is thrown that is not an error is made one first, since Hono
   * prints such a thing whatever it is given.
   */
  const streamed = (c: Context, body: (stream: SSEStreamingApi) => Promise<void>) =>
    streamSSE(
      c,
      async (stream) => {
        try {
          await body(stream)
        } catch (thrown) {
          throw thrown instanceof Error ? thrown : new Error('The event stream failed')
        }
      },
      (error) => {
        streamFailure(error)
        try {
          error.message = STREAM_FAILURE
        } catch {
          // An error that cannot be written to keeps its message: the log has already told it.
        }
        return Promise.resolve()
      },
    )

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

  // A scan is started by the site's own form (apps/api/src/guards.ts).
  const fromTheSiteJson = fromTheSite({
    origin: deps.origin,
    json: true,
    refuse: (c) => refuse(c, 'bad-request'),
    foreign,
  })

  /**
   * Accounts (M4.1), when on. The scan route asks it who is signed in; a request without a good
   * session cookie is an anonymous one, whatever else is wrong with the cookie (Phase 4 design §1.3).
   */
  const access =
    deps.accounts === undefined
      ? undefined
      : mountAccounts(app, { ...deps, accounts: deps.accounts })

  /**
   * Starts a scan. `identity` is the person already known to be signed in (a saved site's scan),
   * or 'ask': the session is looked up, after the visitor's request is counted and before
   * Turnstile, which a signed-in person skips: their sign-in was the check, and their own quota
   * (keyed by the account, not the address) takes the visitor's.
   */
  const startScan = async (
    c: Context,
    input: { readonly url: string; readonly turnstileToken: string; readonly tool?: string },
    identity: 'ask' | AccountUser,
  ): Promise<Response> => {
    // A tool page sends its tool; the site sends no other.
    const tool = input.tool
    if (tool !== undefined && toolDefinition(tool) === undefined) return refuse(c, 'bad-request')

    // What needs no network first; the checks that cost something come after the visitor's
    // throttle, Turnstile and the visitor's own limit, so the API cannot be used to look up
    // names, to call Cloudflare without end, or to fill the queue.
    const parsed = parseTarget(input.url, deps.policy)
    if (!parsed.ok) return refuse(c, parsed.code)
    // Without the visitor's address there is no limit to keep, so there is no scan.
    const address = deps.address(c)
    if (address === null) return refuse(c, 'unavailable')
    const at = now()
    const visitor = deps.connectionKey(address, at)
    // Cloudflare is asked for every request that gets this far, so a visitor's requests are
    // counted first, whatever comes of them: past their throttle, it is not asked at all.
    const attempt = await deps.limiter.take(
      `attempt:${visitor}`,
      deps.limits.attempts,
      at.getTime(),
    )
    if (!attempt.ok) return refuse(c, 'rate-limited', attempt.retryAfterSeconds)
    const user = identity === 'ask' ? ((await access?.identify(c)) ?? null) : identity
    // Whose limits and place this scan takes: the account's, or the visitor's.
    let holder = visitor
    let places = deps.limits.inFlight
    if (user === null || access === undefined) {
      if (!(await deps.turnstile(input.turnstileToken))) {
        return refuse(c, 'turnstile-failed')
      }
      const own = await deps.limiter.take(
        `connection:${visitor}`,
        deps.limits.perConnection,
        at.getTime(),
      )
      if (!own.ok) return refuse(c, 'rate-limited', own.retryAfterSeconds)
    } else {
      const plan = planOf(access.plans, user.id)
      holder = `account:${user.id}`
      places = plan.inFlight
      const own = await deps.limiter.take(holder, plan.scans, at.getTime())
      if (!own.ok) return refuse(c, 'rate-limited', own.retryAfterSeconds)
    }
    // The visitor's network is asked after the visitor, so a request their own limit refuses
    // takes nothing of the network's.
    const network = deps.networkKey?.(address, at) ?? null
    if (network !== null) {
      const shared = await deps.limiter.take(
        `network:${network}`,
        deps.limits.perNetwork,
        at.getTime(),
      )
      if (!shared.ok) return refuse(c, 'rate-limited', shared.retryAfterSeconds)
    }
    // The visitor's place comes before any name is looked up: at their cap, they cost the API
    // nothing more. A place is given back unless the scan is queued.
    const id = deps.newId()
    if (!(await holdPlace(deps, holder, id, places, at.getTime()))) {
      return refuse(c, 'rate-limited')
    }
    let queued = false
    try {
      const resolved = await resolveTarget(parsed.value, deps.policy, deps.resolver)
      if (!resolved.ok) return refuse(c, resolved.code)
      const host = await deps.limiter.take(
        hostLimitKey(parsed.value.host),
        deps.limits.perHost,
        at.getTime(),
      )
      if (!host.ok) return refuse(c, 'rate-limited', host.retryAfterSeconds)
      const ahead = await deps.queue.waiting()
      if (ahead >= deps.limits.queue) return refuse(c, 'unavailable')

      // Stored and announced before it is queued, so the worker never starts a scan whose
      // record or first event is not there yet.
      // Given once, in the answer below, and kept as its hash alone (M5, issue #33).
      const deleteToken = newDeleteToken()
      await deps.store.create({
        id,
        url: resolved.value,
        createdAt: at,
        deleteTokenHash: hashDeleteToken(deleteToken),
        ...(tool === undefined ? {} : { tool }),
      })
      try {
        // A whole-page scan of a signed-in person is theirs to see again; a tool's is not kept.
        if (user !== null && access !== undefined && tool === undefined) {
          await access.data.link({
            userId: user.id,
            scanId: id,
            url: resolved.value,
            source: 'manual',
            createdAt: at,
          })
        }
        await deps.events.publish(id, { type: 'queued', ahead })
        await deps.queue.add({
          id,
          url: resolved.value,
          ...(tool === undefined ? {} : { tool }),
        })
      } catch (error) {
        // Never queued, so never run: the scan fails at once, and says so to any page it has.
        await deps.store.fail(id, at).catch(() => false)
        await deps.events.publish(id, { type: 'error' }).catch(() => '')
        throw error
      }
      queued = true
      const created: CreateScanResponse = { id, deleteToken }
      return c.json(created, 202)
    } finally {
      if (!queued) await deps.inFlight.release(holder, [id]).catch(() => undefined)
    }
  }

  app.post(
    '/api/scans',
    fromTheSiteJson,
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
      return startScan(c, request.data, 'ask')
    },
  )

  if (access !== undefined && deps.accounts !== undefined) {
    mountSites(app, {
      access,
      accounts: deps.accounts,
      origin: deps.origin,
      policy: deps.policy,
      log: deps.log,
      now,
      startScan,
    })
    if (deps.accounts.crawls !== undefined && deps.accounts.crawlSettings !== undefined) {
      mountCrawls(app, {
        access,
        accounts: deps.accounts,
        crawls: deps.accounts.crawls,
        store: deps.store,
        settings: deps.accounts.crawlSettings,
        origin: deps.origin,
        log: deps.log,
        now,
      })
    }
    if (deps.accounts.sender !== undefined) {
      mountMonitors(app, {
        access,
        accounts: deps.accounts,
        origin: deps.origin,
        policy: deps.policy,
        resolver: deps.resolver,
        limiter: deps.limiter,
        log: deps.log,
        now,
        sender: deps.accounts.sender,
        mail: deps.accounts.mail ?? noMailer,
      })
    }
  }

  app.get('/api/scans/:id', async (c) => {
    const scan = await findScan(c.req.param('id'))
    if (scan === null) return c.notFound()
    const summary: ScanSummary = {
      id: scan.id,
      url: scan.url,
      state: scan.state,
      createdAt: scan.createdAt.toISOString(),
      ...(scan.tool === null ? {} : { tool: scan.tool }),
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
      return streamed(c, async (stream) => {
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
    return streamed(c, async (stream) => {
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
          // Nothing new: a ping, which the page sees (a comment, it would not), keeps the
          // connection and tells the page it is alive; and the scan is asked if it ended unseen.
          await stream.writeSSE({ event: 'ping', data: '' })
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

  /**
   * Deletes a scan and its report (M5, issue #33), for the token its creation gave. A page on
   * another site cannot send one: it needs a preflight, which the API never answers. Not asking
   * an Origin or a type is deliberate: the token is what allows it, and whoever holds it may
   * send it from anywhere, curl included.
   */
  app.delete('/api/reports/:id', async (c) => {
    const id = c.req.param('id')
    if (!SCAN_ID_PATTERN.test(id)) return c.notFound()
    const token = /^Bearer +([^ ]+)$/i.exec(c.req.header('authorization') ?? '')?.[1]
    if (token === undefined || !DELETE_TOKEN_PATTERN.test(token)) {
      c.header('WWW-Authenticate', 'Bearer')
      return c.json({ error: 'unauthorized' }, 401)
    }
    const deleted = await deps.store.delete(id, hashDeleteToken(token))
    if (deleted === 'missing') return c.notFound()
    if (deleted === 'forbidden') return c.json({ error: 'forbidden' }, 403)
    // The visitor who made the scan asks for its deletion, as a rule: its place is theirs to give
    // back now, not a scan about to have a record until the API's own timeouts say it is not.
    // Another visitor's place is left to that, and to the scan store, which knows it is gone.
    const address = deps.address(c)
    if (address !== null) {
      await deps.inFlight.release(deps.connectionKey(address, now()), [id]).catch(() => undefined)
    }
    return c.body(null, 204)
  })

  registerFontRoutes(app, {
    store: deps.store,
    limiter: deps.limiter,
    window: deps.limits.attempts,
    policy: deps.policy,
    resolver: deps.resolver,
    address: deps.address,
    connectionKey: deps.connectionKey,
    now,
    ...(deps.fontFetcher === undefined ? {} : { fetcher: deps.fontFetcher }),
  })

  registerGscRoutes(app, {
    gsc: deps.gsc,
    store: deps.store,
    limiter: deps.limiter,
    window: deps.limits.attempts,
    address: deps.address,
    connectionKey: deps.connectionKey,
    now,
    log: failure,
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
