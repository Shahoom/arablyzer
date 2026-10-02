import { randomBytes } from 'node:crypto'
import { TURNSTILE_ACTION } from '@arablyzer/api-contract'
import { checkDenyCidrs, defaultResolver, safeFetch, serverPolicy } from '@arablyzer/egress'
import { USER_AGENT } from '@arablyzer/engine/identity'
import { limitsFrom } from '@arablyzer/plans'
import {
  requireSecret,
  type InFlight,
  type RateLimiter,
  type ScanEvents,
  type ScanQueue,
  type ScanStore,
} from '@arablyzer/store'
import type { ApiDeps } from './app'
import { clientAddress, connectionKey, networkKey, trustProxyFrom } from './client'
import { newScanId } from './ids'
import { cloudflareTurnstile, isTurnstileTestSecret, noTurnstile } from './turnstile'

type Env = Readonly<Record<string, string | undefined>>

export interface Stores {
  readonly store: ScanStore
  readonly queue: ScanQueue
  readonly events: ScanEvents
  readonly limiter: RateLimiter
  readonly inFlight: InFlight
}

/**
 * Set to 1, this takes Cloudflare's Turnstile test keys in production, which pass every token:
 * for the end-to-end stack alone. compose.e2e.yaml sets it; compose.yaml never passes it on.
 */
export const ALLOW_TEST_KEYS_VARIABLE = 'ARABLYZER_ALLOW_TURNSTILE_TEST_KEYS'

/**
 * The API's settings from the environment, on the stores it is given. Production refuses to
 * start without Turnstile's secret, the site's address (ARABLYZER_SITE, whose host name a
 * Turnstile token must come from, and whose origin a scan request must), the limiter's key, or
 * the limits (packages/plans), and refuses ARABLYZER_ALLOW_PRIVATE (packages/egress) and
 * Cloudflare's Turnstile test keys.
 */
export function apiDeps(
  env: Env,
  stores: Stores,
  log: (message: string) => void = console.warn,
  /** Turnstile's request; tests pass their own. */
  options: { readonly fetcher?: typeof safeFetch } = {},
): ApiDeps {
  const production = env.NODE_ENV === 'production'
  const policy = serverPolicy(env)
  // The server's own public address, IPv4 and IPv6, which nothing the stack runs can see behind
  // NAT: production starts only with it named, and says what the list leaves open.
  if (production) {
    for (const warning of checkDenyCidrs(env.ARABLYZER_DENY_CIDRS).warnings) log(warning)
  }
  const resolver = defaultResolver(policy)
  const trust = trustProxyFrom(env.ARABLYZER_TRUST_PROXY)
  // X-Forwarded-For is believed only from the site's server, which proves it with this secret
  // (infra/Caddyfile); without it, no visitor has an address, and no scan starts.
  const proxySecret =
    trust === 'proxy' && production
      ? requireSecret('ARABLYZER_PROXY_SECRET', env.ARABLYZER_PROXY_SECRET)
      : env.ARABLYZER_PROXY_SECRET?.trim()

  const secret = env.TURNSTILE_SECRET?.trim()
  if ((secret === undefined || secret === '') && production) {
    throw new Error('TURNSTILE_SECRET must be set in production (BUILD-PLAN §13)')
  }
  const site = env.ARABLYZER_SITE?.trim()
  if ((site === undefined || site === '') && production) {
    throw new Error('ARABLYZER_SITE must be set in production: Turnstile checks its host name')
  }
  const siteUrl = site === undefined || site === '' ? undefined : new URL(site)
  const hostname = siteUrl?.hostname
  // Cloudflare's test keys pass every token: in production, there would be no check at all.
  const testSecret = secret !== undefined && isTurnstileTestSecret(secret)
  const testKeysAllowed = testSecret && env[ALLOW_TEST_KEYS_VARIABLE]?.trim() === '1'
  if (testSecret && production) {
    if (!testKeysAllowed) {
      throw new Error(
        "TURNSTILE_SECRET is one of Cloudflare's test keys, which pass every token: never in production (issue #30)",
      )
    }
    log("Cloudflare's Turnstile test keys are allowed: the end-to-end stack only, never a site.")
  }
  const turnstile =
    secret === undefined || secret === ''
      ? noTurnstile
      : // Through the egress proxy too, like every request the API makes (M2.1 plan §5b).
        cloudflareTurnstile({
          secret,
          userAgent: USER_AGENT,
          policy,
          resolver,
          action: TURNSTILE_ACTION,
          allowTestKeys: !production || testKeysAllowed,
          ...(hostname === undefined ? {} : { hostname }),
          ...(options.fetcher === undefined ? {} : { fetcher: options.fetcher }),
        })
  if (turnstile === noTurnstile)
    log('Turnstile is off: TURNSTILE_SECRET is not set (development only).')

  let key = env.ARABLYZER_LIMIT_SECRET?.trim() ?? ''
  if (key === '') {
    if (production) throw new Error('ARABLYZER_LIMIT_SECRET must be set in production (§14)')
    key = randomBytes(32).toString('base64url')
  }
  if (production) requireSecret('ARABLYZER_LIMIT_SECRET', key)

  return {
    ...(siteUrl === undefined ? {} : { origin: siteUrl.origin }),
    limits: limitsFrom(env),
    policy,
    resolver,
    turnstile,
    ...stores,
    address: (c) => clientAddress(c, trust, proxySecret),
    connectionKey: (address, now) => connectionKey(address, key, now),
    networkKey: (address, now) => networkKey(address, key, now),
    newId: newScanId,
  }
}
