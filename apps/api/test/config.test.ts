import {
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { apiDeps } from '../src/config'
import { PROXY_SECRET_HEADER } from '../src/proxy-secret'

const stores = () => ({
  store: new MemoryScanStore(),
  queue: new MemoryScanQueue(),
  events: new MemoryScanEvents(),
  limiter: new MemoryRateLimiter(),
})

/** Everything production needs; each test takes one away. */
const PRODUCTION = {
  NODE_ENV: 'production',
  TURNSTILE_SECRET: 'turnstile-secret',
  ARABLYZER_SITE: 'https://arablyzer.example',
  ARABLYZER_LIMIT_SECRET: 'a-limit-secret-of-more-than-thirty-two-characters',
  ARABLYZER_LIMIT_CONNECTION_SCANS: '10',
  ARABLYZER_LIMIT_CONNECTION_SECONDS: '3600',
  ARABLYZER_LIMIT_HOST_SCANS: '20',
  ARABLYZER_LIMIT_HOST_SECONDS: '3600',
  ARABLYZER_LIMIT_QUEUE: '50',
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

  it('refuses a limit key shorter than 32 characters, and never says what it was', () => {
    const short = { ...PRODUCTION, ARABLYZER_LIMIT_SECRET: 'too-short-secret' }
    const message = failure(() => apiDeps(short, stores()))
    expect(message).toMatch(/ARABLYZER_LIMIT_SECRET must be 32 characters or more/)
    expect(message).not.toContain('too-short-secret')
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
