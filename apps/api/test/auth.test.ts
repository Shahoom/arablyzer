import { memoryAdapter } from 'better-auth/adapters/memory'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAuth, SESSION_COOKIE } from '../src/auth'
import { CLIENT_ID, CLIENT_SECRET, idToken, stubGoogle } from './support/google'

const SITE = new URL('https://arablyzer.example')

function setup(options: { production?: boolean } = {}) {
  const tables = { user: [], session: [], account: [], verification: [] } as Record<
    string,
    unknown[]
  >
  const auth = createAuth({
    site: SITE,
    secret: 'a'.repeat(40),
    database: memoryAdapter(tables),
    google: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
    production: options.production ?? false,
    log: () => undefined,
  })
  return { auth, tables }
}

const browser = {
  'x-forwarded-for': '203.0.113.9',
  'user-agent': 'Mozilla/5.0 (a real browser)',
  origin: SITE.origin,
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('createAuth', () => {
  it('refuses a short secret and a site that is not https in production', () => {
    expect(() =>
      createAuth({
        site: SITE,
        secret: 'short',
        database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
        google: { clientId: 'a', clientSecret: 'b' },
        production: true,
        log: () => undefined,
      }),
    ).toThrow(/BETTER_AUTH_SECRET/)
    expect(() =>
      createAuth({
        site: new URL('http://arablyzer.example'),
        secret: 'a'.repeat(40),
        database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
        google: { clientId: 'a', clientSecret: 'b' },
        production: true,
        log: () => undefined,
      }),
    ).toThrow(/https/)
  })

  it('signs in with a One Tap ID token, keeping an address, a name and nothing else', async () => {
    const google = stubGoogle()
    const { auth, tables } = setup({ production: true })
    const response = await auth.api.oneTapCallback({
      body: { idToken: idToken() },
      headers: new Headers(browser),
      asResponse: true,
    })
    expect(response.status).toBe(200)
    const cookie = response.headers.getSetCookie().join('\n')
    expect(cookie).toContain(`__Secure-${SESSION_COOKIE}=`)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
    expect(cookie).toMatch(/Secure/i)
    const [user] = tables.user as Record<string, unknown>[]
    expect(user).toMatchObject({ email: 'ali@example.com', emailVerified: true, name: 'Ali' })
    expect(user?.image ?? null).toBeNull()
    const [session] = tables.session as Record<string, unknown>[]
    expect(session?.ipAddress ?? null).toBeNull()
    expect(session?.userAgent ?? null).toBeNull()
    const [account] = tables.account as Record<string, unknown>[]
    expect(account).toMatchObject({ providerId: 'google', accountId: '1234567890' })
    for (const key of ['accessToken', 'refreshToken', 'idToken', 'password']) {
      expect(account?.[key] ?? null).toBeNull()
    }
    // Only the certificates were fetched: the sign-in is the token the page sends.
    expect(google.calls.map((call) => call.url)).toEqual([
      'https://www.googleapis.com/oauth2/v3/certs',
    ])
  })

  it.each([
    ['an address Google does not vouch for', { email_verified: false }],
    ['no address', { email: null }],
    ['another client', { aud: 'someone-else.apps.googleusercontent.com' }],
    ['an expired token', { iat: 1, exp: 2 }],
    ['another issuer', { iss: 'https://evil.example' }],
  ])('gives no session for %s', async (_name, claims) => {
    stubGoogle()
    const { auth, tables } = setup()
    const response = (await auth.api
      .oneTapCallback({
        body: { idToken: idToken(claims) },
        headers: new Headers(browser),
        asResponse: true,
      })
      .catch((error: unknown) => error)) as Response | { statusCode?: number }
    const status = response instanceof Response ? response.status : (response.statusCode ?? 500)
    expect(status).toBeGreaterThanOrEqual(400)
    expect(tables.session).toHaveLength(0)
    expect(tables.user).toHaveLength(0)
  })

  it("rejects a token signed by a key that is not Google's", async () => {
    stubGoogle()
    const { auth, tables } = setup()
    const [head, payload] = idToken().split('.')
    const forged = `${head}.${payload}.${Buffer.from('forged').toString('base64url')}`
    const response = await auth.api.oneTapCallback({
      body: { idToken: forged },
      headers: new Headers(browser),
      asResponse: true,
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(tables.session).toHaveLength(0)
  })

  it('starts the code flow with PKCE and the three scopes, and finishes it without keeping tokens', async () => {
    const google = stubGoogle()
    const { auth, tables } = setup()
    const start = await auth.api.signInSocial({
      body: {
        provider: 'google',
        callbackURL: '/en/account/',
        errorCallbackURL: '/en/login/',
        disableRedirect: true,
      },
      headers: new Headers(browser),
      asResponse: true,
    })
    const { url } = (await start.json()) as { url: string }
    const authorize = new URL(url)
    expect(authorize.origin + authorize.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    )
    expect(authorize.searchParams.get('scope')).toBe('email profile openid')
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorize.searchParams.get('redirect_uri')).toBe(
      `${SITE.origin}/api/auth/callback/google`,
    )
    expect(authorize.searchParams.get('access_type')).toBeNull()
    expect(authorize.searchParams.get('include_granted_scopes')).toBeNull()
    const stateCookie = start.headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; ')

    const state = authorize.searchParams.get('state') ?? ''
    const back = await auth.handler(
      new Request(`${SITE.origin}/api/auth/callback/google?code=abc&state=${state}`, {
        headers: { ...browser, cookie: stateCookie },
        redirect: 'manual',
      }),
    )
    expect(back.status).toBe(302)
    expect(new URL(back.headers.get('location') ?? '', SITE).pathname).toBe('/en/account/')
    expect(back.headers.getSetCookie().join('\n')).toContain(SESSION_COOKIE)
    const exchanges = google.calls.filter(
      (call) => call.url === 'https://oauth2.googleapis.com/token',
    )
    expect(exchanges).toHaveLength(1)
    expect(exchanges[0]?.body).toContain('grant_type=authorization_code')
    expect(exchanges[0]?.body).toContain('code_verifier=')
    const [account] = tables.account as Record<string, unknown>[]
    for (const key of ['accessToken', 'refreshToken', 'idToken']) {
      expect(account?.[key] ?? null).toBeNull()
    }
    expect((tables.user as Record<string, unknown>[])[0]?.image ?? null).toBeNull()

    // The same callback again is no sign-in: its state was spent.
    const again = await auth.handler(
      new Request(`${SITE.origin}/api/auth/callback/google?code=abc&state=${state}`, {
        headers: { ...browser, cookie: stateCookie },
        redirect: 'manual',
      }),
    )
    expect(again.headers.getSetCookie().join('\n')).not.toContain('session_token=')
    expect(tables.session).toHaveLength(1)
  })

  it('has no password sign-in and no routes of the library that we did not turn on', async () => {
    stubGoogle()
    const { auth } = setup()
    const response = await auth.handler(
      new Request(`${SITE.origin}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: SITE.origin },
        body: JSON.stringify({ email: 'a@b.co', password: 'password1234', name: 'x' }),
      }),
    )
    expect(response.status).toBeGreaterThanOrEqual(400)
  })
})
