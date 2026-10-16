import type { ScanErrorCode } from '@arablyzer/api-contract/codes'
import type { Context } from 'hono'
import type { ApiDeps } from './app'

/** What the helpers of app.ts hand over: the scan API's own refusals. */
export interface TakeHelpers {
  readonly refuse: (c: Context, error: ScanErrorCode, retryAfterSeconds?: number) => Response
}

/**
 * Takes one scan of the visitor's quota for a request that is not a scan (the search tools, the text
 * tools), the way a scan takes it: the attempt throttle, Turnstile, the visitor's bucket, the
 * network's. Null when the request may go on, else the refusal to send.
 */
export function visitorScan(
  deps: ApiDeps,
  helpers: TakeHelpers,
  now: () => Date,
): (c: Context, token: unknown) => Promise<Response | null> {
  return async (c, token) => {
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
}
