import {
  MemoryInFlight,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
import { TURNSTILE_ACTION } from '@arablyzer/api-contract'
import type { FetchResult } from '@arablyzer/egress'
import { describe, expect, it } from 'vitest'
import { apiDeps } from '../src/config'

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
  ARABLYZER_LIMIT_SECRET: 'limit-secret',
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
} as const

const without = (name: keyof typeof PRODUCTION) =>
  Object.fromEntries(Object.entries(PRODUCTION).filter(([key]) => key !== name))

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
