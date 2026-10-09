import { createHmac, randomBytes } from 'node:crypto'
import { GSC_CALLBACK_PATH, TURNSTILE_ACTION } from '@arablyzer/api-contract'
import {
  checkDenyCidrs,
  defaultResolver,
  EGRESS_PROXY_VARIABLE,
  safeFetch,
  serverPolicy,
  type EgressPolicy,
  type Resolver,
} from '@arablyzer/egress'
import { USER_AGENT } from '@arablyzer/engine/identity'
import {
  accountsModeFrom,
  authLimitsFrom,
  limitsFrom,
  planCatalogFrom,
  type ScanLimits,
} from '@arablyzer/plans'
import {
  requireSecret,
  type AccountData,
  type Handoff,
  type InFlight,
  type MonitorData,
  type RateLimiter,
  type ScanEvents,
  type ScanQueue,
  type ScanStore,
} from '@arablyzer/store'
import type { AccountsDeps } from './accounts'
import type { ApiDeps } from './app'
import { createAuth, type AuthDatabase } from './auth'
import { clientAddress, connectionKey, networkKey, trustProxyFrom } from './client'
import { googleApi } from './gsc/google'
import { newScanId } from './ids'
import { mailerFrom } from './monitor/mail'
import { webhookSender } from './monitor/webhook'
import { cloudflareTurnstile, isTurnstileTestSecret, noTurnstile } from './turnstile'

type Env = Readonly<Record<string, string | undefined>>

export interface Stores {
  readonly store: ScanStore
  readonly queue: ScanQueue
  readonly events: ScanEvents
  readonly limiter: RateLimiter
  readonly inFlight: InFlight
  /** One-time values for the Search Console connection; without it the feature is off. */
  readonly handoff?: Handoff
  /** Where Better Auth keeps accounts and sessions; needed when ARABLYZER_ACCOUNTS is on. */
  readonly auth?: { readonly database: AuthDatabase }
  /** What an account keeps (its sites and scans); needed with accounts on (M4.2). */
  readonly accountData?: AccountData
  /** What monitoring keeps (M4.3); without it, monitoring and alerts are off. */
  readonly monitorData?: MonitorData
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
  options: {
    readonly fetcher?: typeof safeFetch
    /** Google's endpoints elsewhere: tests' stand-in. */
    readonly rewriteGoogle?: (url: string) => string
  } = {},
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

  // Search Console (apps/api/src/gsc): on only with the OAuth client's id and secret, the site's
  // address to send the visitor back to, and a store for the one-time values. Half a client is a
  // mistake, said at start in production.
  const clientId = env.ARABLYZER_GSC_CLIENT_ID?.trim() ?? ''
  const clientSecret = env.ARABLYZER_GSC_CLIENT_SECRET?.trim() ?? ''
  if (production && (clientId === '') !== (clientSecret === '')) {
    throw new Error('ARABLYZER_GSC_CLIENT_ID and ARABLYZER_GSC_CLIENT_SECRET are set together')
  }
  const { handoff, store, queue, events, limiter, inFlight } = stores
  const otherStores = { store, queue, events, limiter, inFlight }
  const gsc =
    clientId !== '' && clientSecret !== '' && siteUrl !== undefined && handoff !== undefined
      ? {
          clientId,
          clientSecret,
          redirectUri: `${siteUrl.origin}${GSC_CALLBACK_PATH}`,
          origin: siteUrl.origin,
          secure: siteUrl.protocol === 'https:',
          // The cookie's key is derived from the limiter's secret, for this use alone.
          signingKey: createHmac('sha256', key).update('arablyzer gsc flow cookie').digest(),
          handoff,
          google: googleApi({
            policy,
            resolver,
            ...(options.fetcher === undefined ? {} : { fetcher: options.fetcher }),
            ...(options.rewriteGoogle === undefined ? {} : { rewrite: options.rewriteGoogle }),
          }),
        }
      : undefined
  if (production && (clientId !== '') !== (gsc !== undefined)) {
    log('Search Console is off: it needs ARABLYZER_SITE and the store for its one-time values.')
  }

  const limits = limitsFrom(env)
  const accounts = accountsFrom(env, {
    production,
    siteUrl,
    database: stores.auth?.database,
    data: stores.accountData,
    monitors: stores.monitorData,
    policy,
    resolver,
    fetcher: options.fetcher,
    limits,
    log,
  })

  return {
    ...(siteUrl === undefined ? {} : { origin: siteUrl.origin }),
    ...(gsc === undefined ? {} : { gsc }),
    ...(accounts === undefined ? {} : { accounts }),
    limits,
    policy,
    resolver,
    turnstile,
    ...otherStores,
    address: (c) => clientAddress(c, trust, proxySecret),
    connectionKey: (address, now) => connectionKey(address, key, now),
    networkKey: (address, now) => networkKey(address, key, now),
    newId: newScanId,
  }
}

/** The variables of sign-in with Google, separate from Search Console's even if the owner uses one client for both. */
export const AUTH_GOOGLE_CLIENT_ID_VARIABLE = 'ARABLYZER_AUTH_GOOGLE_CLIENT_ID'
export const AUTH_GOOGLE_CLIENT_SECRET_VARIABLE = 'ARABLYZER_AUTH_GOOGLE_CLIENT_SECRET'

/**
 * Accounts (M4.1), off unless ARABLYZER_ACCOUNTS=on. On, everything they need must be set, and
 * the start says which is not: the site's address, Google's client, the library's secret, and, in
 * production, the egress proxy for the library's own requests to Google (Node's env proxy: the
 * library uses the global `fetch`, which the API's lint rule keeps everything else off).
 */
function accountsFrom(
  env: Env,
  options: {
    readonly production: boolean
    readonly siteUrl: URL | undefined
    readonly database: AuthDatabase | undefined
    readonly data: AccountData | undefined
    readonly monitors: MonitorData | undefined
    readonly policy: EgressPolicy
    readonly resolver: Resolver
    readonly fetcher: typeof safeFetch | undefined
    readonly limits: ScanLimits
    readonly log: (message: string) => void
  },
): AccountsDeps | undefined {
  if (accountsModeFrom(env) !== 'on') return undefined
  const { production, siteUrl, database, data } = options
  if (siteUrl === undefined) throw new Error('ARABLYZER_ACCOUNTS=on needs ARABLYZER_SITE')
  if (database === undefined) {
    throw new Error('ARABLYZER_ACCOUNTS=on needs a database for accounts (stores.auth)')
  }
  if (data === undefined) {
    throw new Error('ARABLYZER_ACCOUNTS=on needs a store for sites and scans (stores.accountData)')
  }
  const clientId = env[AUTH_GOOGLE_CLIENT_ID_VARIABLE]?.trim() ?? ''
  const clientSecret = env[AUTH_GOOGLE_CLIENT_SECRET_VARIABLE]?.trim() ?? ''
  if (clientId === '')
    throw new Error(`${AUTH_GOOGLE_CLIENT_ID_VARIABLE} must be set with accounts on`)
  if (clientSecret === '') {
    throw new Error(`${AUTH_GOOGLE_CLIENT_SECRET_VARIABLE} must be set with accounts on`)
  }
  let secret = env.BETTER_AUTH_SECRET?.trim() ?? ''
  if (production) secret = requireSecret('BETTER_AUTH_SECRET', secret)
  else if (secret === '') secret = randomBytes(32).toString('base64url')
  if (production) {
    const proxy = env[EGRESS_PROXY_VARIABLE]?.trim() ?? ''
    if (proxy === '') {
      throw new Error(
        `${EGRESS_PROXY_VARIABLE} must be set with accounts on: Google is reached through it`,
      )
    }
    if (env.NODE_USE_ENV_PROXY?.trim() !== '1') {
      throw new Error(
        'NODE_USE_ENV_PROXY must be 1 with accounts on: the library calls Google through the proxy',
      )
    }
    if (env.HTTPS_PROXY?.trim() !== proxy) {
      throw new Error(`HTTPS_PROXY must equal ${EGRESS_PROXY_VARIABLE} with accounts on`)
    }
  }
  return {
    auth: createAuth({
      site: siteUrl,
      secret,
      database,
      google: { clientId, clientSecret },
      production,
      // An account's scans and their reports go with it; the rest cascades in the database.
      beforeDelete: async (userId) => {
        await data.eraseUser(userId)
        await options.monitors?.eraseUser(userId)
      },
      log: options.log,
    }),
    limits: authLimitsFrom(env),
    secureCookies: production,
    data,
    // Production refuses to start without the plan's numbers, as it does without the abuse limits.
    plans: planCatalogFrom(env, options.limits),
    ...(options.monitors === undefined
      ? {}
      : {
          monitors: options.monitors,
          sender: webhookSender({
            policy: options.policy,
            resolver: options.resolver,
            ...(options.fetcher === undefined ? {} : { fetcher: options.fetcher }),
          }),
          mail: mailerFrom(env),
        }),
  }
}
