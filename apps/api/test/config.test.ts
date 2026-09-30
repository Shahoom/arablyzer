import {
  MemoryInFlight,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
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
