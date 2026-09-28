import { randomBytes } from 'node:crypto'
import { defaultResolver, serverPolicy } from '@arablyzer/egress'
import { USER_AGENT } from '@arablyzer/engine/identity'
import { limitsFrom } from '@arablyzer/plans'
import type { RateLimiter, ScanEvents, ScanQueue, ScanStore } from '@arablyzer/store'
import type { ApiDeps } from './app'
import { clientAddress, connectionKey, trustProxyFrom } from './client'
import { newScanId } from './ids'
import { cloudflareTurnstile, noTurnstile } from './turnstile'

type Env = Readonly<Record<string, string | undefined>>

export interface Stores {
  readonly store: ScanStore
  readonly queue: ScanQueue
  readonly events: ScanEvents
  readonly limiter: RateLimiter
}

/**
 * The API's settings from the environment, on the stores it is given. Production refuses to
 * start without Turnstile's secret, the site's address (ARABLYZER_SITE, whose host name a
 * Turnstile token must come from), the limiter's key, or the limits (packages/plans), and
 * refuses ARABLYZER_ALLOW_PRIVATE (packages/egress).
 */
export function apiDeps(
  env: Env,
  stores: Stores,
  log: (message: string) => void = console.warn,
): ApiDeps {
  const production = env.NODE_ENV === 'production'
  const policy = serverPolicy(env)
  const trust = trustProxyFrom(env.ARABLYZER_TRUST_PROXY)

  const secret = env.TURNSTILE_SECRET?.trim()
  if ((secret === undefined || secret === '') && production) {
    throw new Error('TURNSTILE_SECRET must be set in production (BUILD-PLAN §13)')
  }
  const site = env.ARABLYZER_SITE?.trim()
  if ((site === undefined || site === '') && production) {
    throw new Error('ARABLYZER_SITE must be set in production: Turnstile checks its host name')
  }
  const hostname = site === undefined || site === '' ? undefined : new URL(site).hostname
  const turnstile =
    secret === undefined || secret === ''
      ? noTurnstile
      : cloudflareTurnstile({
          secret,
          userAgent: USER_AGENT,
          ...(hostname === undefined ? {} : { hostname }),
        })
  if (turnstile === noTurnstile)
    log('Turnstile is off: TURNSTILE_SECRET is not set (development only).')

  let key = env.ARABLYZER_LIMIT_SECRET?.trim() ?? ''
  if (key === '') {
    if (production) throw new Error('ARABLYZER_LIMIT_SECRET must be set in production (§14)')
    key = randomBytes(32).toString('base64url')
  }

  return {
    limits: limitsFrom(env),
    policy,
    resolver: defaultResolver(policy),
    turnstile,
    ...stores,
    address: (c) => clientAddress(c, trust),
    connectionKey: (address, now) => connectionKey(address, key, now),
    newId: newScanId,
  }
}
