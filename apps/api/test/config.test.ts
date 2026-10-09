import {
  MemoryAccountData,
  MemoryInFlight,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
import { TURNSTILE_ACTION } from '@arablyzer/api-contract'
import type { FetchResult } from '@arablyzer/egress'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { apiDeps } from '../src/config'
import { PROXY_SECRET_HEADER } from '../src/proxy-secret'

const stores = () => ({
  store: new MemoryScanStore(),
  queue: new MemoryScanQueue(),
  events: new MemoryScanEvents(),
  limiter: new MemoryRateLimiter(),
  inFlight: new MemoryInFlight(),
})

/** Everything production needs; each test takes one away. */
const PRODUCTION = {
  NODE_ENV: 'production',
  TURNSTILE_SECRET: 'turnstile-secret',
  ARABLYZER_SITE: 'https://arablyzer.example',
  ARABLYZER_LIMIT_SECRET: 'a-limit-secret-of-more-than-thirty-two-characters',
  ARABLYZER_LIMIT_CONNECTION_SCANS: '10',
  ARABLYZER_LIMIT_CONNECTION_SECONDS: '3600',
  ARABLYZER_LIMIT_NETWORK_SCANS: '100',
  ARABLYZER_LIMIT_NETWORK_SECONDS: '3600',
  ARABLYZER_LIMIT_ATTEMPT_REQUESTS: '60',
  ARABLYZER_LIMIT_ATTEMPT_SECONDS: '3600',
  ARABLYZER_LIMIT_HOST_SCANS: '20',
  ARABLYZER_LIMIT_HOST_SECONDS: '3600',
  ARABLYZER_LIMIT_QUEUE: '50',
  ARABLYZER_LIMIT_INFLIGHT: '2',
  ARABLYZER_DENY_CIDRS: '93.184.215.7/32, 2a01:4f8:c17:1234::1/128',
} as const

const without = (name: keyof typeof PRODUCTION) =>
  Object.fromEntries(Object.entries(PRODUCTION).filter(([key]) => key !== name))

/** What a call throws, as its message; empty when it does not throw. */
function failure(call: () => unknown): string {
  try {
    call()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  return ''
}

describe('apiDeps', () => {
  it('starts in production with everything production needs', () => {
    const logged: string[] = []
    const deps = apiDeps(PRODUCTION, stores(), (message) => logged.push(message))
    expect(deps.limits.perConnection).toEqual({ scans: 10, seconds: 3600 })
    expect(logged).toEqual([])
  })

  it('refuses to start in production without Turnstile, the site, the key or the limits', () => {
    expect(() => apiDeps(without('TURNSTILE_SECRET'), stores())).toThrow(/TURNSTILE_SECRET/)
    expect(() => apiDeps(without('ARABLYZER_SITE'), stores())).toThrow(/ARABLYZER_SITE/)
    expect(() => apiDeps(without('ARABLYZER_LIMIT_SECRET'), stores())).toThrow(
      /ARABLYZER_LIMIT_SECRET/,
    )
    expect(() => apiDeps(without('ARABLYZER_LIMIT_QUEUE'), stores())).toThrow(
      /ARABLYZER_LIMIT_QUEUE/,
    )
  })

  it('refuses to start in production without any of the limits the abuse checks use', () => {
    for (const name of [
      'ARABLYZER_LIMIT_NETWORK_SCANS',
      'ARABLYZER_LIMIT_NETWORK_SECONDS',
      'ARABLYZER_LIMIT_ATTEMPT_REQUESTS',
      'ARABLYZER_LIMIT_ATTEMPT_SECONDS',
      'ARABLYZER_LIMIT_INFLIGHT',
    ] as const) {
      expect(() => apiDeps(without(name), stores()), name).toThrow(new RegExp(name))
    }
  })

  it('takes the site’s origin from ARABLYZER_SITE, whatever path it is given with', () => {
    expect(apiDeps(PRODUCTION, stores()).origin).toBe('https://arablyzer.example')
    expect(
      apiDeps({ ...PRODUCTION, ARABLYZER_SITE: 'https://arablyzer.example/en/' }, stores()).origin,
    ).toBe('https://arablyzer.example')
    expect(
      apiDeps({ ...PRODUCTION, ARABLYZER_SITE: 'http://localhost:4321' }, stores()).origin,
    ).toBe('http://localhost:4321')
    // Development without a site: no origin to hold requests to.
    expect(apiDeps({ NODE_ENV: 'development' }, stores(), () => undefined).origin).toBeUndefined()
  })

  it('refuses a limit key shorter than 32 characters, and never says what it was', () => {
    const short = { ...PRODUCTION, ARABLYZER_LIMIT_SECRET: 'too-short-secret' }
    const message = failure(() => apiDeps(short, stores()))
    expect(message).toMatch(/ARABLYZER_LIMIT_SECRET must be 32 characters or more/)
    expect(message).not.toContain('too-short-secret')
  })

  it("refuses to start in production without the server's own address, or with one it cannot read", () => {
    expect(() => apiDeps(without('ARABLYZER_DENY_CIDRS'), stores())).toThrow(
      /ARABLYZER_DENY_CIDRS must name the server's own/,
    )
    expect(() =>
      apiDeps({ ...PRODUCTION, ARABLYZER_DENY_CIDRS: '93.184.215.7' }, stores()),
    ).toThrow(/Invalid deny CIDR: 93\.184\.215\.7 /)
    expect(() => apiDeps({ ...PRODUCTION, ARABLYZER_DENY_CIDRS: '0.0.0.0/0' }, stores())).toThrow(
      /refuses every address/,
    )
  })

  it("says what the server's addresses leave open: no IPv6 range, or no public one", () => {
    const logged: string[] = []
    const log = (message: string) => logged.push(message)
    apiDeps({ ...PRODUCTION, ARABLYZER_DENY_CIDRS: '93.184.215.7/32' }, stores(), log)
    expect(logged).toHaveLength(1)
    expect(logged[0]).toMatch(/names no IPv6 range/)
    logged.length = 0
    apiDeps({ ...PRODUCTION, ARABLYZER_DENY_CIDRS: '192.168.1.10/32' }, stores(), log)
    expect(logged).toHaveLength(2)
    expect(logged[0]).toMatch(/names no public address/)
    expect(logged[1]).toMatch(/names no IPv6 range/)
    logged.length = 0
    apiDeps(PRODUCTION, stores(), log)
    expect(logged).toEqual([])
  })

  it('never opens private addresses in production', () => {
    expect(() => apiDeps({ ...PRODUCTION, ARABLYZER_ALLOW_PRIVATE: '1' }, stores())).toThrow(
      /never in production/,
    )
  })

  it('runs without Turnstile in development, and says so', () => {
    const logged: string[] = []
    apiDeps({ NODE_ENV: 'development' }, stores(), (message) => logged.push(message))
    expect(logged).toEqual(['Turnstile is off: TURNSTILE_SECRET is not set (development only).'])
  })
})

describe('Turnstile in production', () => {
  const TEST_SECRETS = [
    '1x0000000000000000000000000000000AA',
    '2x0000000000000000000000000000000AA',
    '3x0000000000000000000000000000000AA',
  ]
  /** A Turnstile check whose answer from Cloudflare is this. */
  const answering = (answer: unknown) => () =>
    Promise.resolve({
      response: { status: 200, body: new TextEncoder().encode(JSON.stringify(answer)) },
      error: null,
    } as unknown as FetchResult)
  const check = (answer: unknown, env: Record<string, string> = PRODUCTION) =>
    apiDeps(env, stores(), () => undefined, { fetcher: answering(answer) }).turnstile('token')

  // Issue #30: the example env told a local run to use Cloudflare's test keys, which pass every
  // token, and nothing stopped a deployment from keeping them.
  it('refuses Cloudflare’s test keys, which check nothing', () => {
    for (const secret of TEST_SECRETS) {
      expect(() => apiDeps({ ...PRODUCTION, TURNSTILE_SECRET: secret }, stores()), secret).toThrow(
        /test key.*never in production/i,
      )
    }
  })

  it('refuses them whatever the override is, unless it is exactly 1', () => {
    for (const allow of ['', '0', 'true', 'yes', ' 2 ']) {
      expect(() =>
        apiDeps(
          {
            ...PRODUCTION,
            TURNSTILE_SECRET: TEST_SECRETS[0] ?? '',
            ARABLYZER_ALLOW_TURNSTILE_TEST_KEYS: allow,
          },
          stores(),
        ),
      ).toThrow(/test key/i)
    }
  })

  it('takes them only for the end-to-end stack, which says so, and the log says so too', async () => {
    const logged: string[] = []
    const env = {
      ...PRODUCTION,
      TURNSTILE_SECRET: TEST_SECRETS[0] ?? '',
      ARABLYZER_SITE: 'https://example.com',
      ARABLYZER_ALLOW_TURNSTILE_TEST_KEYS: '1',
    }
    const deps = apiDeps(env, stores(), (message) => logged.push(message), {
      fetcher: answering({
        success: true,
        hostname: 'example.com',
        metadata: { result_with_testing_key: true },
      }),
    })
    expect(logged).toHaveLength(1)
    expect(logged[0]).toMatch(/test keys/i)
    expect(await deps.turnstile('XXXX.DUMMY.TOKEN.XXXX')).toBe(true)
  })

  it('takes them in development, where nothing depends on the check', () => {
    for (const secret of TEST_SECRETS) {
      expect(() =>
        apiDeps({ NODE_ENV: 'development', TURNSTILE_SECRET: secret }, stores()),
      ).not.toThrow()
    }
  })

  it('does not let the override loosen a real key: a real key’s answer never says it is a test’s', async () => {
    const env = { ...PRODUCTION, ARABLYZER_ALLOW_TURNSTILE_TEST_KEYS: '1' }
    const testing = {
      success: true,
      hostname: 'arablyzer.example',
      action: 'scan',
      metadata: { result_with_testing_key: true },
    }
    expect(await check(testing, env)).toBe(false)
  })

  it('refuses an answer from a test key even where the secret is not one that looks like it', async () => {
    const testing = {
      success: true,
      hostname: 'arablyzer.example',
      metadata: { result_with_testing_key: true },
    }
    expect(await check(testing)).toBe(false)
  })

  it('binds the scan action, which the site’s widget sets: another, or none, is refused', async () => {
    const ours = { success: true, hostname: 'arablyzer.example' }
    expect(await check({ ...ours, action: TURNSTILE_ACTION })).toBe(true)
    expect(await check({ ...ours, action: 'other' })).toBe(false)
    expect(await check(ours)).toBe(false)
  })
})

describe('the site server behind the API', () => {
  const SECRET = 'a-proxy-secret-of-more-than-thirty-two-characters'
  const BEHIND = { ...PRODUCTION, ARABLYZER_TRUST_PROXY: 'proxy', ARABLYZER_PROXY_SECRET: SECRET }

  /** The address the API takes for a request with these headers. */
  async function addressOf(env: Record<string, string>, headers: Record<string, string>) {
    const deps = apiDeps(env, stores())
    const app = new Hono()
    app.get('/', (c) => c.text(deps.address(c) ?? 'none'))
    return (await app.request('/', { headers })).text()
  }

  it('starts in production only with the secret it checks, 32 characters or more', () => {
    const missing = { ...BEHIND, ARABLYZER_PROXY_SECRET: undefined }
    expect(() => apiDeps(missing, stores())).toThrow(/ARABLYZER_PROXY_SECRET must be set/)
    const short = { ...BEHIND, ARABLYZER_PROXY_SECRET: 'short-one' }
    const message = failure(() => apiDeps(short, stores()))
    expect(message).toMatch(/ARABLYZER_PROXY_SECRET must be 32 characters or more/)
    expect(message).not.toContain('short-one')
    expect(() => apiDeps(BEHIND, stores())).not.toThrow()
  })

  it('does not ask for it where no proxy is trusted', () => {
    expect(() => apiDeps({ ...PRODUCTION, ARABLYZER_TRUST_PROXY: 'none' }, stores())).not.toThrow()
    expect(() => apiDeps(PRODUCTION, stores())).not.toThrow()
  })

  it("takes the visitor's address from the forwarded header only of a request with the secret", async () => {
    const forwarded = { 'x-forwarded-for': '203.0.113.8' }
    expect(await addressOf(BEHIND, { ...forwarded, [PROXY_SECRET_HEADER]: SECRET })).toBe(
      '203.0.113.8',
    )
    expect(await addressOf(BEHIND, forwarded)).toBe('none')
    expect(await addressOf(BEHIND, { ...forwarded, [PROXY_SECRET_HEADER]: 'guess' })).toBe('none')
  })
})

describe('apiDeps with accounts', () => {
  const ACCOUNTS = {
    ...PRODUCTION,
    ARABLYZER_ACCOUNTS: 'on',
    ARABLYZER_AUTH_GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com',
    ARABLYZER_AUTH_GOOGLE_CLIENT_SECRET: 'google-client-secret',
    BETTER_AUTH_SECRET: 'a-better-auth-secret-of-more-than-thirty-two-characters',
    ARABLYZER_LIMIT_SIGNIN_REQUESTS: '20',
    ARABLYZER_LIMIT_SIGNIN_SECONDS: '600',
    ARABLYZER_EGRESS_PROXY: 'http://egress:4750',
    NODE_USE_ENV_PROXY: '1',
    HTTPS_PROXY: 'http://egress:4750',
    ARABLYZER_PLAN_ACCOUNT_SCANS: '30',
    ARABLYZER_PLAN_ACCOUNT_SCAN_SECONDS: '3600',
    ARABLYZER_PLAN_ACCOUNT_INFLIGHT: '3',
    ARABLYZER_PLAN_ACCOUNT_SAVED_SITES: '5',
    ARABLYZER_PLAN_ACCOUNT_HISTORY_DAYS: '90',
  } as const
  const withAuth = () => {
    const base = stores()
    return {
      ...base,
      auth: { database: memoryAdapter({ user: [], session: [], account: [], verification: [] }) },
      accountData: new MemoryAccountData(base.store),
    }
  }
  const minus = (name: keyof typeof ACCOUNTS) =>
    Object.fromEntries(Object.entries(ACCOUNTS).filter(([key]) => key !== name))

  it('is off unless it is switched on, and then reads none of its settings', () => {
    expect(apiDeps(PRODUCTION, stores()).accounts).toBeUndefined()
    expect(
      apiDeps({ ...PRODUCTION, ARABLYZER_ACCOUNTS: 'off', BETTER_AUTH_SECRET: 'short' }, stores())
        .accounts,
    ).toBeUndefined()
    expect(() => apiDeps({ ...PRODUCTION, ARABLYZER_ACCOUNTS: 'yes' }, stores())).toThrow(
      /ARABLYZER_ACCOUNTS is on or off/,
    )
  })

  it('starts in production with everything set', () => {
    const deps = apiDeps(ACCOUNTS, withAuth(), () => undefined)
    expect(deps.accounts?.secureCookies).toBe(true)
    expect(deps.accounts?.limits.signIn).toEqual({ scans: 20, seconds: 600 })
    expect(deps.accounts?.plans.account).toMatchObject({ savedSites: 5, historyDays: 90 })
  })

  it('needs the store for sites and scans', () => {
    const { auth, ...rest } = withAuth()
    expect(() => apiDeps(ACCOUNTS, { ...rest, auth }, () => undefined)).not.toThrow()
    expect(() => apiDeps(ACCOUNTS, { ...stores(), auth }, () => undefined)).toThrow(/accountData/)
  })

  it.each([
    'ARABLYZER_AUTH_GOOGLE_CLIENT_ID',
    'ARABLYZER_AUTH_GOOGLE_CLIENT_SECRET',
    'BETTER_AUTH_SECRET',
    'ARABLYZER_LIMIT_SIGNIN_REQUESTS',
    'ARABLYZER_LIMIT_SIGNIN_SECONDS',
    'ARABLYZER_EGRESS_PROXY',
    'NODE_USE_ENV_PROXY',
    'HTTPS_PROXY',
    'ARABLYZER_PLAN_ACCOUNT_SCANS',
    'ARABLYZER_PLAN_ACCOUNT_SCAN_SECONDS',
    'ARABLYZER_PLAN_ACCOUNT_INFLIGHT',
    'ARABLYZER_PLAN_ACCOUNT_SAVED_SITES',
    'ARABLYZER_PLAN_ACCOUNT_HISTORY_DAYS',
  ] as const)('refuses to start in production without %s, naming it', (name) => {
    expect(() => apiDeps(minus(name), withAuth(), () => undefined)).toThrow(new RegExp(name))
  })

  it('refuses a library proxy that is not the egress proxy, and a short secret', () => {
    expect(() =>
      apiDeps({ ...ACCOUNTS, HTTPS_PROXY: 'http://elsewhere:3128' }, withAuth(), () => undefined),
    ).toThrow(/HTTPS_PROXY must equal/)
    expect(() =>
      apiDeps({ ...ACCOUNTS, BETTER_AUTH_SECRET: 'short' }, withAuth(), () => undefined),
    ).toThrow(/BETTER_AUTH_SECRET/)
  })

  it("needs a database for accounts, and the site's address", () => {
    expect(() => apiDeps(ACCOUNTS, stores(), () => undefined)).toThrow(/stores\.auth/)
    expect(() =>
      apiDeps({ NODE_ENV: 'development', ARABLYZER_ACCOUNTS: 'on' }, withAuth()),
    ).toThrow(/ARABLYZER_SITE/)
  })

  it('takes development without the proxy or a secret', () => {
    const deps = apiDeps(
      {
        NODE_ENV: 'development',
        ARABLYZER_ACCOUNTS: 'on',
        ARABLYZER_SITE: 'http://127.0.0.1:8080',
        ARABLYZER_AUTH_GOOGLE_CLIENT_ID: 'id',
        ARABLYZER_AUTH_GOOGLE_CLIENT_SECRET: 'secret',
      },
      withAuth(),
      () => undefined,
    )
    expect(deps.accounts?.secureCookies).toBe(false)
  })
})
