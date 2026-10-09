import { DEFAULT_POLICY } from '@arablyzer/egress'
import { DEVELOPMENT_AUTH_LIMITS, DEVELOPMENT_LIMITS, type AuthLimits } from '@arablyzer/plans'
import {
  MemoryInFlight,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccountsDeps } from '../src/accounts'
import { createApp } from '../src/app'
import { createAuth } from '../src/auth'
import { CLIENT_ID, CLIENT_SECRET, idToken, stubGoogle, type Claims } from './support/google'

const SITE = new URL('https://arablyzer.example')

function setup(options: { limits?: AuthLimits; address?: string | null; accounts?: boolean } = {}) {
  const tables: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [] }
  const auth = createAuth({
    site: SITE,
    secret: 'a'.repeat(40),
    database: memoryAdapter(tables),
    google: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
    production: false,
    log: () => undefined,
  })
  const accounts: AccountsDeps = {
    auth,
    limits: options.limits ?? DEVELOPMENT_AUTH_LIMITS,
    secureCookies: false,
  }
  const address = options.address === undefined ? '203.0.113.9' : options.address
  const logged: string[] = []
  const app = createApp({
    limits: DEVELOPMENT_LIMITS,
    policy: DEFAULT_POLICY,
    resolver: () => Promise.resolve([]),
    turnstile: () => Promise.resolve(true),
    limiter: new MemoryRateLimiter(),
    store: new MemoryScanStore(),
    queue: new MemoryScanQueue(),
    events: new MemoryScanEvents(20),
    inFlight: new MemoryInFlight(),
    address: () => address,
    connectionKey: (a) => `key-of-${a}`,
    newId: () => 'scan000000000000000001',
    origin: SITE.origin,
    log: (message) => logged.push(message),
    ...(options.accounts === false ? {} : { accounts }),
  })
  const send = (
    method: string,
    path: string,
    init: { body?: unknown; raw?: string; cookie?: string; headers?: Record<string, string> } = {},
  ) =>
    app.request(path, {
      method,
      headers: {
        origin: SITE.origin,
        ...(init.body !== undefined || init.raw !== undefined
          ? { 'content-type': 'application/json' }
          : {}),
        ...(init.cookie === undefined ? {} : { cookie: init.cookie }),
        ...init.headers,
      },
      ...(init.body !== undefined || init.raw !== undefined
        ? { body: init.raw ?? JSON.stringify(init.body) }
        : {}),
    })
  /** Signs in with a One Tap token and returns the cookie the browser would keep. */
  const signIn = async (claims: Claims = {}) => {
    const response = await send('POST', '/api/session/one-tap', {
      body: { credential: idToken(claims) },
    })
    expect(response.status).toBe(200)
    return {
      cookie: response.headers
        .getSetCookie()
        .map((line) => line.split(';')[0])
        .join('; '),
      body: (await response.json()) as Record<string, unknown>,
    }
  }
  return { app, tables, send, signIn, logged }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('sign-in with One Tap', () => {
  it('answers the account, sets the session cookie, and the cookie reads it back', async () => {
    const google = stubGoogle()
    const { send, signIn } = setup()
    const { cookie, body } = await signIn()
    expect(body).toMatchObject({ email: 'ali@example.com', name: 'Ali', language: null })
    expect(Object.keys(body).sort()).toEqual(['createdAt', 'email', 'id', 'language', 'name'])
    expect(cookie).toMatch(/^arablyzer\.session_token=/)
    const read = await send('GET', '/api/account', { cookie })
    expect(read.status).toBe(200)
    expect(await read.json()).toEqual(body)
    expect(google.calls.every((call) => call.url.startsWith('https://www.googleapis.com/'))).toBe(
      true,
    )
  })

  it('every answer is no-store, never indexed, and sends no referrer', async () => {
    stubGoogle()
    const { send } = setup()
    const response = await send('GET', '/api/account')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it.each([
    ['no Origin', { headers: { origin: '' } }],
    ['another Origin', { headers: { origin: 'https://evil.example' } }],
    ['not JSON', { headers: { 'content-type': 'text/plain' }, raw: '{}' }],
    ['a body over 8 KB', { raw: JSON.stringify({ credential: `${'a'.repeat(9000)}.b.c` }) }],
    ['an unknown field', { body: { credential: 'a.b.c', callbackURL: 'https://evil.example' } }],
    ['no credential', { body: {} }],
    ['a credential that is no token', { body: { credential: 'hello world' } }],
  ])('refuses %s before Google or the library is asked', async (_name, init) => {
    const google = stubGoogle()
    const { send, tables } = setup()
    const response = await send('POST', '/api/session/one-tap', init)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'bad-request' })
    expect(google.calls).toHaveLength(0)
    expect(tables.session).toHaveLength(0)
  })

  it.each([
    ['an address Google does not vouch for', { email_verified: false }],
    ['no address', { email: null }],
    ['another client', { aud: 'someone-else.apps.googleusercontent.com' }],
    ['an expired token', { iat: 1, exp: 2 }],
  ])('answers invalid-token for %s, with no account and no cookie', async (_name, claims) => {
    stubGoogle()
    const { send, tables } = setup()
    const response = await send('POST', '/api/session/one-tap', {
      body: { credential: idToken(claims) },
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid-token' })
    expect(response.headers.getSetCookie()).toEqual([])
    expect(tables.user).toHaveLength(0)
    expect(tables.session).toHaveLength(0)
  })

  it("counts a visitor's requests, valid or not, and says when to come back", async () => {
    const google = stubGoogle()
    const { send } = setup({ limits: { signIn: { scans: 2, seconds: 60 } } })
    for (let i = 0; i < 2; i++) {
      await send('POST', '/api/session/one-tap', { body: { credential: 'a.b.c' } })
    }
    const before = google.calls.length
    const limited = await send('POST', '/api/session/one-tap', { body: { credential: idToken() } })
    expect(limited.status).toBe(429)
    const body = (await limited.json()) as { error: string; retryAfterSeconds: number }
    expect(body.error).toBe('rate-limited')
    expect(body.retryAfterSeconds).toBeGreaterThan(0)
    expect(limited.headers.get('retry-after')).toBe(String(body.retryAfterSeconds))
    expect(google.calls).toHaveLength(before)
  })

  it('has no sign-in for a visitor with no address', async () => {
    stubGoogle()
    const { send } = setup({ address: null })
    const response = await send('POST', '/api/session/one-tap', { body: { credential: idToken() } })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
  })
})

describe('the session', () => {
  it('is 401 for a missing, garbage, tampered or revoked cookie, never 500', async () => {
    stubGoogle()
    const { send, signIn } = setup()
    expect((await send('GET', '/api/account')).status).toBe(401)
    expect(
      (await send('GET', '/api/account', { cookie: 'arablyzer.session_token=garbage' })).status,
    ).toBe(401)
    const { cookie } = await signIn()
    const tampered = cookie.replace(/\.[^.;]*$/, '.AAAA')
    expect((await send('GET', '/api/account', { cookie: tampered })).status).toBe(401)
    expect((await send('DELETE', '/api/session', { cookie })).status).toBe(204)
    expect((await send('GET', '/api/account', { cookie })).status).toBe(401)
  })

  it('reads an expired session as signed out', async () => {
    stubGoogle()
    vi.useFakeTimers({ toFake: ['Date'] })
    const { send, signIn } = setup()
    const { cookie } = await signIn()
    vi.setSystemTime(Date.now() + 7 * 24 * 3600 * 1000 + 1000)
    expect((await send('GET', '/api/account', { cookie })).status).toBe(401)
  })

  it("is 503 when the store is down, and tells the log without the visitor's data", async () => {
    stubGoogle()
    const { send, signIn, tables, logged } = setup()
    const { cookie } = await signIn()
    tables.session = new Proxy([], {
      get() {
        throw new Error('the store is down')
      },
    })
    const response = await send('GET', '/api/account', { cookie })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'unavailable' })
    expect(logged.join('\n')).not.toContain('ali@example.com')
  })

  it('costs no query for a request with no cookie', async () => {
    stubGoogle()
    const { send, tables } = setup()
    tables.session = new Proxy([], {
      get() {
        throw new Error('must not be read')
      },
    })
    expect((await send('GET', '/api/account')).status).toBe(401)
  })

  it('signs out here with or without a session, and everywhere on request', async () => {
    stubGoogle()
    const { send, signIn } = setup()
    const out = await send('DELETE', '/api/session')
    expect(out.status).toBe(204)
    expect(out.headers.getSetCookie().join('\n')).toMatch(/arablyzer\.session_token=;.*Max-Age=0/)
    const first = await signIn()
    const second = await signIn()
    const everywhere = await send('DELETE', '/api/sessions', { cookie: first.cookie })
    expect(everywhere.status).toBe(204)
    expect((await send('GET', '/api/account', { cookie: first.cookie })).status).toBe(401)
    expect((await send('GET', '/api/account', { cookie: second.cookie })).status).toBe(401)
    expect((await send('DELETE', '/api/sessions')).status).toBe(401)
    expect((await send('DELETE', '/api/session', { headers: { origin: '' } })).status).toBe(400)
  })
})

describe('the account', () => {
  it('changes its language, to ar or en alone, for a signed-in person alone', async () => {
    stubGoogle()
    const { send, signIn } = setup()
    const { cookie } = await signIn()
    const changed = await send('PATCH', '/api/account', { cookie, body: { language: 'en' } })
    expect(changed.status).toBe(200)
    expect(await changed.json()).toMatchObject({ language: 'en' })
    expect(await (await send('GET', '/api/account', { cookie })).json()).toMatchObject({
      language: 'en',
    })
    expect((await send('PATCH', '/api/account', { cookie, body: { language: 'fr' } })).status).toBe(
      400,
    )
    expect(
      (await send('PATCH', '/api/account', { cookie, body: { language: 'ar', name: 'x' } })).status,
    ).toBe(400)
    expect((await send('PATCH', '/api/account', { body: { language: 'ar' } })).status).toBe(401)
  })

  it('erases the account after a recent sign-in, and everything of it', async () => {
    stubGoogle()
    const { send, signIn, tables } = setup()
    const { cookie } = await signIn()
    const other = await signIn()
    expect((await send('DELETE', '/api/account', { cookie, body: {} })).status).toBe(400)
    expect(
      (await send('DELETE', '/api/account', { cookie, body: { confirm: false } })).status,
    ).toBe(400)
    expect((await send('DELETE', '/api/account', { body: { confirm: true } })).status).toBe(401)
    const deleted = await send('DELETE', '/api/account', { cookie, body: { confirm: true } })
    expect(deleted.status).toBe(204)
    expect(deleted.headers.getSetCookie().join('\n')).toMatch(/Max-Age=0/)
    expect(tables.user).toHaveLength(0)
    expect(tables.account).toHaveLength(0)
    expect(tables.session).toHaveLength(0)
    expect((await send('GET', '/api/account', { cookie: other.cookie })).status).toBe(401)
  })

  it('asks for a fresh sign-in first, once the session is ten minutes old', async () => {
    stubGoogle()
    vi.useFakeTimers({ toFake: ['Date'] })
    const { send, signIn, tables } = setup()
    const { cookie } = await signIn()
    vi.setSystemTime(Date.now() + 11 * 60 * 1000)
    const refused = await send('DELETE', '/api/account', { cookie, body: { confirm: true } })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toEqual({ error: 'fresh-login-required' })
    expect(tables.user).toHaveLength(1)
  })
})

describe("Google's redirect flow", () => {
  it("starts in the page's language and ends on its account page, with a session", async () => {
    stubGoogle()
    const { send } = setup()
    const started = await send('POST', '/api/session/google', { body: { lang: 'en' } })
    expect(started.status).toBe(200)
    const { url } = (await started.json()) as { url: string }
    const authorize = new URL(url)
    expect(authorize.host).toBe('accounts.google.com')
    expect(authorize.searchParams.get('scope')).toBe('email profile openid')
    const cookie = started.headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; ')
    const back = await send(
      'GET',
      `/api/auth/callback/google?code=abc&state=${authorize.searchParams.get('state') ?? ''}`,
      { cookie, headers: { origin: '' } },
    )
    expect(back.status).toBe(302)
    expect(new URL(back.headers.get('location') ?? '', SITE).pathname).toBe('/en/account')
    const session = back.headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; ')
    expect((await send('GET', '/api/account', { cookie: session })).status).toBe(200)
  })

  it('sends an address Google does not vouch for back to the sign-in page, with no session', async () => {
    const google = stubGoogle(idToken({ email_verified: false }))
    const { send, tables } = setup()
    const started = await send('POST', '/api/session/google', { body: { lang: 'ar' } })
    const { url } = (await started.json()) as { url: string }
    const cookie = started.headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; ')
    const back = await send(
      'GET',
      `/api/auth/callback/google?code=abc&state=${new URL(url).searchParams.get('state') ?? ''}`,
      { cookie, headers: { origin: '' } },
    )
    expect(back.status).toBe(302)
    const location = new URL(back.headers.get('location') ?? '', SITE)
    expect(location.pathname).toBe('/login')
    expect(location.searchParams.get('error')).not.toBeNull()
    expect(back.headers.getSetCookie().join('\n')).not.toContain('session_token=ey')
    expect(tables.session).toHaveLength(0)
    expect(tables.user).toHaveLength(0)
    expect(google.calls.some((call) => call.url === 'https://oauth2.googleapis.com/token')).toBe(
      true,
    )
  })

  it('refuses a callback with a state it never made, and a lang that is not ar or en', async () => {
    stubGoogle()
    const { send, tables } = setup()
    const back = await send('GET', '/api/auth/callback/google?code=abc&state=forged', {
      headers: { origin: '' },
    })
    expect(back.status).toBe(302)
    expect(tables.session).toHaveLength(0)
    expect((await send('POST', '/api/session/google', { body: { lang: 'fr' } })).status).toBe(400)
    expect(
      (
        await send('POST', '/api/session/google', {
          body: { lang: 'ar', callbackURL: 'https://evil.example' },
        })
      ).status,
    ).toBe(400)
  })

  it('sends a token exchange that came to nothing back to the sign-in page, never shows JSON', async () => {
    stubGoogle('not-a-token')
    const { send } = setup()
    const started = await send('POST', '/api/session/google', { body: { lang: 'ar' } })
    const { url } = (await started.json()) as { url: string }
    const cookie = started.headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; ')
    const back = await send(
      'GET',
      `/api/auth/callback/google?code=abc&state=${new URL(url).searchParams.get('state') ?? ''}`,
      { cookie, headers: { origin: '' } },
    )
    expect(back.status).toBe(302)
    expect(back.headers.get('location')).toContain('/login?error=')
  })

  it('counts the callback against the visitor, and sends them back to sign in', async () => {
    stubGoogle()
    const { send } = setup({ limits: { signIn: { scans: 1, seconds: 60 } } })
    await send('GET', '/api/auth/callback/google?code=a&state=b', { headers: { origin: '' } })
    const limited = await send('GET', '/api/auth/callback/google?code=a&state=b', {
      headers: { origin: '' },
    })
    expect(limited.status).toBe(302)
    expect(limited.headers.get('location')).toContain('error=rate-limited')
  })
})

describe("the library's own surface", () => {
  it.each([
    ['GET', '/api/auth/get-session'],
    ['POST', '/api/auth/sign-in/social'],
    ['POST', '/api/auth/sign-in/email'],
    ['POST', '/api/auth/sign-up/email'],
    ['GET', '/api/auth/ok'],
    ['POST', '/api/auth/delete-user'],
    ['POST', '/api/auth/one-tap/callback'],
    ['GET', '/api/auth/list-sessions'],
  ])('does not serve %s %s', async (method, path) => {
    stubGoogle()
    const { send } = setup()
    const response = await send(method, path, method === 'POST' ? { body: {} } : {})
    expect(response.status).toBe(404)
  })
})

describe('with accounts off', () => {
  it.each([
    ['POST', '/api/session/google'],
    ['POST', '/api/session/one-tap'],
    ['DELETE', '/api/session'],
    ['DELETE', '/api/sessions'],
    ['GET', '/api/account'],
    ['PATCH', '/api/account'],
    ['DELETE', '/api/account'],
    ['GET', '/api/auth/callback/google'],
  ])('answers 404 for %s %s', async (method, path) => {
    const { send } = setup({ accounts: false })
    const response = await send(method, path, method === 'GET' ? {} : { body: {} })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not-found' })
  })
})
