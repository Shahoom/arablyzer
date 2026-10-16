import {
  API_KEY_PATTERN,
  API_V1_PATH,
  buildOpenApi,
  decodeCursor,
  encodeCursor,
  RunToolRequest,
  SCAN_ID_PATTERN,
  StartScanRequest,
  TOOL_SLUG_PATTERN,
  V1_ERROR_STATUS,
  V1_PAGE_DEFAULT,
  V1_ENGINES,
  V1ListQuery,
  type CreateScanResponse,
  type ScanErrorCode,
  type V1ErrorCode,
  type V1ScanStarted,
} from '@arablyzer/api-contract'
import type { EgressPolicy } from '@arablyzer/egress'
import type { Window } from '@arablyzer/plans'
import { reportJsonSchema } from '@arablyzer/report-schema'
import type { ApiKeyData, RateLimiter, ScanStore } from '@arablyzer/store'
import { quietly } from '@arablyzer/store'
import { toolDefinition } from '@arablyzer/tools/registry'
import { Hono, type Context, type Next } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { planOf, type AccountsDeps, type SessionAccess } from '../accounts'
import { hashApiKey } from '../ids'
import { parseTarget } from '../target'
import { allTools, ruleDetailOf, ruleOf, rules, scanOfEntry, scanOfRecord } from './present'
import type { StartExtras } from '../app'

export interface V1Deps {
  /** Undefined with accounts off: every route is then 503 `accounts_off`. */
  readonly access: SessionAccess | undefined
  readonly accounts: AccountsDeps | undefined
  readonly keys: ApiKeyData | undefined
  readonly store: ScanStore
  readonly limiter: RateLimiter
  readonly policy: EgressPolicy
  readonly origin: string | undefined
  /** The visitor's limit key, where the deployment knows an address; null without one. */
  readonly visitor: (c: Context) => string | null
  readonly attempts: Window
  readonly log: ((message: string) => void) | undefined
  readonly now: () => Date
  /** Starts a scan for the key's account (app.ts). */
  readonly startScan: (
    c: Context,
    input: { readonly url: string; readonly turnstileToken: string; readonly tool?: string },
    identity: { readonly id: string },
    extras: StartExtras,
  ) => Promise<Response>
}

/** What a request that passed the key check carries, found by the request itself. */
export interface Live {
  readonly userId: string
  readonly keyId: string
  readonly access: SessionAccess
  readonly accounts: AccountsDeps
}

const MAX_BODY_BYTES = 8 * 1024
/** A scan of the same page this long ago or less is the one a repeat is given (the report cache's window). */
export const REUSE_WINDOW_MS = 10 * 60 * 1000
const REUSE_LOOK = 50
const BEARER = /^Bearer +([^ ]+)$/i

const MESSAGES: Readonly<Record<V1ErrorCode, string>> = {
  invalid_request: 'The request is not what this route takes.',
  invalid_url: 'The address is not one a scan takes.',
  blocked_target: 'The address is a place scans never reach.',
  unauthorized: 'A valid API key is needed: Authorization: Bearer arb_…',
  plan_limit: 'The account’s plan allows no more of this.',
  not_found: 'There is nothing here.',
  report_not_ready: 'The scan has no report.',
  rate_limited: 'A limit was reached; try again later.',
  accounts_off: 'Accounts are off in this deployment, so there is no API.',
  unavailable: 'The service is unavailable.',
}

const URL_FAILURE: Readonly<Record<string, V1ErrorCode>> = {
  'invalid-url': 'invalid_url',
  'unsupported-scheme': 'invalid_url',
  'url-too-long': 'invalid_url',
  'credentials-in-url': 'invalid_url',
  'port-not-allowed': 'invalid_url',
  'blocked-host': 'blocked_target',
  'blocked-address': 'blocked_target',
  'dns-failed': 'blocked_target',
}

/**
 * The public API (M5.1): `/api/v1`, authenticated by an API key alone. A session cookie never
 * authenticates here, so a page on another site cannot act for a signed-in person, and no Origin
 * is asked of a client that sends a bearer.
 */
export function mountV1(
  app: Hono,
  deps: V1Deps,
): { readonly gate: (c: Context) => Promise<Live | Response> } {
  const v1 = new Hono()
  // Keyed by the request object Hono keeps for the whole call (bodyLimit swaps the raw one).
  const lives = new WeakMap<object, Live>()
  const liveOf = (c: Context): Live => {
    const live = lives.get(c.req)
    if (live === undefined) throw new Error('A v1 route ran without its key check')
    return live
  }
  const told = quietly('API v1', deps.log)

  const fail = (
    c: Context,
    code: V1ErrorCode,
    options: {
      message?: string
      details?: Record<string, unknown>
      retryAfterSeconds?: number
    } = {},
  ) => {
    if (options.retryAfterSeconds !== undefined) {
      c.header('Retry-After', String(options.retryAfterSeconds))
    }
    if (code === 'unauthorized') c.header('WWW-Authenticate', 'Bearer')
    const details = {
      ...options.details,
      ...(options.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: options.retryAfterSeconds }),
    }
    return c.json(
      {
        error: {
          code,
          message: options.message ?? MESSAGES[code],
          ...(Object.keys(details).length === 0 ? {} : { details }),
        },
      },
      V1_ERROR_STATUS[code],
    )
  }

  // The document describes the API and needs neither a key nor accounts.
  let document: string | undefined
  v1.get('/openapi.json', (c) => {
    document ??= JSON.stringify(
      buildOpenApi({
        reportSchema: reportJsonSchema(),
        ...(deps.origin === undefined ? {} : { server: deps.origin }),
      }),
    )
    return c.body(document, 200, { 'Content-Type': 'application/json; charset=UTF-8' })
  })

  /**
   * Who the request is, from its key: the account it opens, or the answer to send. The API's routes
   * and /mcp both ask it, so one key means one thing everywhere.
   */
  const gate = async (c: Context): Promise<Live | Response> => {
    const { access, accounts, keys } = deps
    if (access === undefined || accounts === undefined || keys === undefined) {
      return fail(c, 'accounts_off')
    }
    const at = deps.now()
    const visitor = deps.visitor(c)
    // A visitor who keeps presenting keys nobody holds is stopped before the store is asked.
    const failures = visitor === null ? null : `apikey-failures:${visitor}`
    if (
      failures !== null &&
      (await deps.limiter.remaining?.(failures, deps.attempts, at.getTime())) === 0
    ) {
      return fail(c, 'rate_limited', { retryAfterSeconds: 60 })
    }
    const presented = BEARER.exec(c.req.header('authorization') ?? '')?.[1]
    const known =
      presented !== undefined && API_KEY_PATTERN.test(presented)
        ? await keys.authenticate(hashApiKey(presented))
        : null
    if (known === null) {
      if (failures !== null) await deps.limiter.take(failures, deps.attempts, at.getTime())
      return fail(c, 'unauthorized')
    }
    // The owner's suspension closes every key of the account (M4.8), whatever the plan says.
    if ((await accounts.admin?.state(known.userId))?.suspendedAt != null) {
      return fail(c, 'unauthorized', { message: 'This account is suspended.' })
    }
    const plan = await planOf(accounts.plans, known.userId)
    // A plan with no API closes it, whatever keys were made before it was closed.
    if (plan.apiScans === 0) {
      return fail(c, 'plan_limit', { details: { limit: 'api', plan: plan.id } })
    }
    const budget: Window = { scans: plan.apiRequests, seconds: 60 }
    const taken = await deps.limiter.take(`apireq:${known.keyId}`, budget, at.getTime())
    c.header('RateLimit-Limit', String(budget.scans))
    const left = taken.ok
      ? ((await deps.limiter.remaining?.(`apireq:${known.keyId}`, budget, at.getTime())) ?? null)
      : 0
    if (left !== null) {
      c.header('RateLimit-Remaining', String(left))
      c.header(
        'RateLimit-Reset',
        String(Math.ceil(((budget.scans - left) * budget.seconds) / budget.scans)),
      )
    }
    if (!taken.ok) return fail(c, 'rate_limited', { retryAfterSeconds: taken.retryAfterSeconds })
    await keys.touch(known.keyId, at).catch((error: unknown) => {
      told(error instanceof Error ? error : new Error('A key’s use was not noted'))
    })
    return { ...known, access, accounts }
  }
  v1.use('*', async (c: Context, next: Next) => {
    const gated = await gate(c)
    if (gated instanceof Response) return gated
    lives.set(c.req, gated)
    await next()
    return undefined
  })

  /** A JSON body of at most 8 KB, checked against the schema; the answer to send when it is not. */
  const bodyOf = async <T>(
    c: Context,
    schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
  ): Promise<{ readonly data: T } | Response> => {
    if (c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
      return fail(c, 'invalid_request', {
        message: 'The body must be JSON (Content-Type: application/json).',
      })
    }
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      return fail(c, 'invalid_request', { message: 'The body is not JSON.' })
    }
    const parsed = schema.safeParse(raw)
    return parsed.success ? { data: parsed.data } : fail(c, 'invalid_request')
  }
  const limited = {
    maxSize: MAX_BODY_BYTES,
    onError: (c: Context) => fail(c, 'invalid_request', { message: 'The body is too large.' }),
  }

  /** Reads `limit` and `cursor`; the answer to send when they are wrong. */
  const pageOf = (c: Context): { offset: number; limit: number } | Response => {
    const parsed = V1ListQuery.safeParse(c.req.query())
    if (!parsed.success)
      return fail(c, 'invalid_request', { message: 'limit or cursor is not valid.' })
    const offset = parsed.data.cursor === undefined ? 0 : decodeCursor(parsed.data.cursor)
    if (offset === null)
      return fail(c, 'invalid_request', { message: 'cursor is not one the API gave.' })
    return { offset, limit: parsed.data.limit ?? V1_PAGE_DEFAULT }
  }
  const pageIn = <T>(items: readonly T[], page: { offset: number; limit: number }) => ({
    data: items.slice(page.offset, page.offset + page.limit),
    meta: {
      nextCursor:
        page.offset + page.limit < items.length ? encodeCursor(page.offset + page.limit) : null,
    },
  })

  /** What a refused start says, in the API's words. */
  async function refusal(c: Context, response: Response): Promise<Response> {
    const body = (await response.json().catch(() => null)) as {
      error?: ScanErrorCode
      retryAfterSeconds?: number
    } | null
    const error = body?.error
    if (error === 'rate-limited') {
      return fail(c, 'rate_limited', { retryAfterSeconds: body?.retryAfterSeconds ?? 60 })
    }
    if (error === 'bad-request') return fail(c, 'invalid_request')
    const mapped = error === undefined ? undefined : URL_FAILURE[error]
    if (mapped !== undefined) return fail(c, mapped, { details: { reason: error } })
    return fail(c, 'unavailable')
  }

  /** Starts a scan with the shared route, and tells its record the way the API does. */
  async function start(
    c: Context,
    live: Live,
    input: { url: string; tool?: string },
    extras: StartExtras,
  ): Promise<Response> {
    const plan = await planOf(live.accounts.plans, live.userId)
    const response = await deps.startScan(
      c,
      {
        url: input.url,
        turnstileToken: '',
        ...(input.tool === undefined ? {} : { tool: input.tool }),
      },
      { id: live.userId },
      { ...extras, api: { cap: plan.apiScans } },
    )
    if (response.status !== 202) return refusal(c, response)
    const created = (await response.json()) as CreateScanResponse
    const record = await deps.store.get(created.id)
    if (record === null) return fail(c, 'unavailable')
    const started: V1ScanStarted = {
      ...scanOfRecord(record, deps.origin),
      reused: false,
      deleteToken: created.deleteToken,
    }
    return c.json({ data: started }, 202)
  }

  /** The account's own scan of this page in the last ten minutes, if one is running or done. */
  async function reusable(live: Live, href: string) {
    const userId = live.userId
    const cutoff = deps.now().getTime() - REUSE_WINDOW_MS
    const recent = (await live.access.data.history(userId, REUSE_LOOK)).filter(
      (entry) =>
        entry.url === href && entry.createdAt.getTime() >= cutoff && entry.state !== 'failed',
    )
    if (recent.length === 0) return null
    const linked = await live.access.data.linkedScans(
      userId,
      recent.map((entry) => entry.scanId),
    )
    return recent.find((entry) => linked.get(entry.scanId)?.source === 'manual') ?? null
  }

  v1.post('/scans', bodyLimit(limited), async (c) => {
    const live = liveOf(c)
    const body = await bodyOf(c, StartScanRequest)
    if (body instanceof Response) return body
    const target = parseTarget(body.data.url, deps.policy)
    if (!target.ok) {
      return fail(c, URL_FAILURE[target.code] ?? 'invalid_url', {
        details: { reason: target.code },
      })
    }
    // All three engines is the default, said or not; fewer is a one-off scan.
    const engines = [...new Set(body.data.engines ?? [])].sort(
      (a, b) => V1_ENGINES.indexOf(a) - V1_ENGINES.indexOf(b),
    )
    const subset = engines.length > 0 && engines.length < V1_ENGINES.length
    if (!subset) {
      const earlier = await reusable(live, target.value.url.href)
      if (earlier !== null) {
        const reused: V1ScanStarted = { ...scanOfEntry(earlier, deps.origin), reused: true }
        return c.json({ data: reused }, 200)
      }
    }
    return start(c, live, { url: body.data.url }, subset ? { engines } : {})
  })

  v1.get('/scans', async (c) => {
    const page = pageOf(c)
    if (page instanceof Response) return page
    const live = liveOf(c)
    // One more than the page, to know whether another follows.
    const entries = await live.access.data.history(live.userId, page.offset + page.limit + 1)
    return c.json(
      pageIn(
        entries.map((entry) => scanOfEntry(entry, deps.origin)),
        page,
      ),
    )
  })

  const scanFor = async (c: Context) => {
    const id = c.req.param('id') ?? ''
    return SCAN_ID_PATTERN.test(id) ? deps.store.get(id) : null
  }

  v1.get('/scans/:id', async (c) => {
    const scan = await scanFor(c)
    if (scan === null) return fail(c, 'not_found')
    return c.json({ data: scanOfRecord(scan, deps.origin) })
  })

  v1.get('/scans/:id/report', async (c) => {
    const scan = await scanFor(c)
    if (scan === null) return fail(c, 'not_found')
    if (scan.report === null) {
      return fail(c, 'report_not_ready', {
        details: { state: scan.state },
        message:
          scan.state === 'failed'
            ? 'The scan failed and has no report.'
            : 'The scan has not finished; poll the scan until its state is complete or partial.',
      })
    }
    return c.json({ data: scan.report })
  })

  v1.get('/tools', async (c) => {
    const page = pageOf(c)
    if (page instanceof Response) return page
    return c.json(pageIn(await allTools(), page))
  })

  v1.post('/tools/:slug/runs', bodyLimit(limited), async (c) => {
    const slug = c.req.param('slug')
    const definition = TOOL_SLUG_PATTERN.test(slug) ? toolDefinition(slug) : undefined
    if (definition === undefined) return fail(c, 'not_found')
    if ((definition.kind ?? 'scan') !== 'scan') {
      return fail(c, 'invalid_request', {
        message: 'This tool runs in the visitor’s browser, not on a page.',
      })
    }
    const body = await bodyOf(c, RunToolRequest)
    if (body instanceof Response) return body
    return start(c, liveOf(c), { url: body.data.url, tool: slug }, {})
  })

  v1.get('/rules', async (c) => {
    const page = pageOf(c)
    if (page instanceof Response) return page
    return c.json(pageIn((await rules()).map(ruleOf), page))
  })

  v1.get('/rules/:ruleId', async (c) => {
    const id = c.req.param('ruleId')
    const rule = (await rules()).find((candidate) => candidate.id === id)
    return rule === undefined ? fail(c, 'not_found') : c.json({ data: ruleDetailOf(rule) })
  })

  v1.all('*', (c) => fail(c, 'not_found'))
  v1.onError((error, c) => {
    told(error)
    return fail(c, 'unavailable')
  })
  app.route(API_V1_PATH, v1)
  return { gate }
}
