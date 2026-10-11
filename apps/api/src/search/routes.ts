import {
  SEARCH_STATUS_PATH,
  SEARCH_SUGGEST_PATH,
  SEARCH_SERP_PATH,
  SERP_MAX_QUERIES,
  type ScanErrorCode,
  type SearchStatus,
} from '@arablyzer/api-contract/codes'
import type { safeFetch } from '@arablyzer/egress'
import type { Hono, Context, MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { ApiDeps } from '../app'
import { serpSampler } from './serp'
import { cleanDomain } from './serp'
import { cleanTerm, suggestTree } from './suggest'

/** The two search tools' switches, from the environment, and the way they reach Google. */
export interface SearchDeps {
  /** ARABLYZER_SUGGEST=1: the suggestion tree. */
  readonly suggest: boolean
  /** ARABLYZER_SERP=1: the results sampler. */
  readonly serp: boolean
  /** Another way to fetch; tests pass their own, which answers for Google. */
  readonly fetcher?: typeof safeFetch
  /** Pauses between questions to Google; tests pass none. */
  readonly sleep?: (ms: number) => Promise<void>
}

/** A request to either tool is a few terms and a token: 4 KB is ample. */
const MAX_BODY_BYTES = 4 * 1024

/** What the helpers of app.ts hand over: the scan API's own refusals and its same-site check. */
interface Helpers {
  readonly fromTheSiteJson: MiddlewareHandler
  readonly refuse: (c: Context, error: ScanErrorCode, retryAfterSeconds?: number) => Response
}

/**
 * The suggestion tree and the results sampler (M5.3). Each request is one scan of the visitor's
 * quota, taken the way a scan takes it (the attempt throttle, Turnstile, the visitor's bucket, the
 * network's), before Google is asked anything; what Google said is kept a day in memory, and
 * nothing of the visitor's is kept at all. Off, a tool's route is a 404.
 */
export function mountSearch(app: Hono, deps: ApiDeps, helpers: Helpers, now: () => Date): void {
  const flags = deps.search
  const status: SearchStatus = { suggest: flags?.suggest === true, serp: flags?.serp === true }
  app.get(SEARCH_STATUS_PATH, (c) => c.json(status))
  if (flags === undefined || (!flags.suggest && !flags.serp)) return

  const clock = () => now().getTime()
  const suggest = suggestTree({
    policy: deps.policy,
    resolver: deps.resolver,
    ...(flags.fetcher === undefined ? {} : { fetcher: flags.fetcher }),
    ...(flags.sleep === undefined ? {} : { sleep: flags.sleep }),
    now: clock,
  })
  const serp = serpSampler({
    policy: deps.policy,
    resolver: deps.resolver,
    ...(flags.fetcher === undefined ? {} : { fetcher: flags.fetcher }),
    ...(flags.sleep === undefined ? {} : { sleep: flags.sleep }),
    now: clock,
  })

  /** The visitor's scan, taken: null when it may go on, else the refusal to send. */
  const takeScan = async (c: Context, token: unknown): Promise<Response | null> => {
    const address = deps.address(c)
    if (address === null) return helpers.refuse(c, 'unavailable')
    const at = now()
    const visitor = deps.connectionKey(address, at)
    const attempt = await deps.limiter.take(
      `attempt:${visitor}`,
      deps.limits.attempts,
      at.getTime(),
    )
    if (!attempt.ok) return helpers.refuse(c, 'rate-limited', attempt.retryAfterSeconds)
    if (typeof token !== 'string' || !(await deps.turnstile(token))) {
      return helpers.refuse(c, 'turnstile-failed')
    }
    const own = await deps.limiter.take(
      `connection:${visitor}`,
      deps.limits.perConnection,
      at.getTime(),
    )
    if (!own.ok) return helpers.refuse(c, 'rate-limited', own.retryAfterSeconds)
    const network = deps.networkKey?.(address, at) ?? null
    if (network !== null) {
      const shared = await deps.limiter.take(
        `network:${network}`,
        deps.limits.perNetwork,
        at.getTime(),
      )
      if (!shared.ok) return helpers.refuse(c, 'rate-limited', shared.retryAfterSeconds)
    }
    return null
  }

  const body = async (c: Context): Promise<Record<string, unknown> | null> => {
    try {
      const raw: unknown = await c.req.json()
      return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }
  const limit = bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => helpers.refuse(c, 'bad-request'),
  })

  if (flags.suggest) {
    app.post(SEARCH_SUGGEST_PATH, helpers.fromTheSiteJson, limit, async (c) => {
      const request = await body(c)
      const seed = cleanTerm(request?.seed)
      if (request === null || seed === null) return helpers.refuse(c, 'bad-request')
      const refused = await takeScan(c, request.turnstileToken)
      if (refused !== null) return refused
      return c.json(await suggest.run(seed))
    })
  }

  if (flags.serp) {
    app.post(SEARCH_SERP_PATH, helpers.fromTheSiteJson, limit, async (c) => {
      const request = await body(c)
      const list = request?.queries
      if (request === null || !Array.isArray(list) || list.length === 0) {
        return helpers.refuse(c, 'bad-request')
      }
      if (list.length > SERP_MAX_QUERIES) return helpers.refuse(c, 'bad-request')
      const queries = list.map((item) => cleanTerm(item, 8))
      if (queries.some((query) => query === null)) return helpers.refuse(c, 'bad-request')
      const distinct = [...new Set(queries as string[])]
      const typed = request.domain
      const domain = typed === undefined || typed === '' ? null : cleanDomain(typed)
      if (typed !== undefined && typed !== '' && domain === null) {
        return helpers.refuse(c, 'bad-request')
      }
      const refused = await takeScan(c, request.turnstileToken)
      if (refused !== null) return refused
      return c.json(await serp.run(distinct, domain))
    })
  }
}
