import {
  ACCOUNT_PAGE_PATH,
  ACCOUNT_PATH,
  AccountPatch,
  DeleteAccountRequest,
  GOOGLE_CALLBACK_PATH,
  GoogleStartRequest,
  LOGIN_PAGE_PATH,
  OneTapRequest,
  SESSION_GOOGLE_PATH,
  SESSION_ONE_TAP_PATH,
  SESSION_PATH,
  SESSIONS_PATH,
  type AccountSummary,
  type AuthErrorCode,
  type AuthErrorResponse,
  type Language,
} from '@arablyzer/api-contract'
import type { AccountPlan, AuthLimits, PlanCatalog } from '@arablyzer/plans'
import { quietly, type AccountData } from '@arablyzer/store'
import type { Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { ZodType } from 'zod'
import type { ApiDeps } from './app'
import type { Auth } from './auth'
import { SESSION_COOKIE } from './auth'
import { fromTheSite } from './guards'

export interface AccountsDeps {
  readonly auth: Auth
  readonly limits: AuthLimits
  /** Whether the session cookie is `Secure` (and `__Secure-` prefixed): every production site. */
  readonly secureCookies: boolean
  /** What an account keeps: its saved sites and the scans linked to it (M4.2). */
  readonly data: AccountData
  /** The plans' numbers, from the environment (packages/plans). */
  readonly plans: PlanCatalog
}

/**
 * The plan a person is on. Every account is on `account` until subscriptions exist (M4.4), which
 * will read them here, and nowhere else.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- M4.4 reads the person's subscription here
export function planOf(plans: PlanCatalog, _userId: string): AccountPlan {
  return plans.account
}

/** What the account routes give the rest of the API: who is signed in. */
export interface SessionAccess {
  /**
   * The signed-in person, or null for anyone else: no cookie, a bad one, an expired one, a store
   * that is down. A scan never fails on this; the request is an anonymous one.
   */
  readonly identify: (c: Context) => Promise<AccountUser | null>
  /** The signed-in person with the cookies to hand on, or the 401 (503) answer to send. */
  readonly require: (
    c: Context,
  ) => Promise<{ readonly user: AccountUser; readonly cookies: readonly string[] } | Response>
  readonly fail: (c: Context, error: AuthErrorCode, retryAfterSeconds?: number) => Response
  readonly data: AccountData
  readonly plans: PlanCatalog
}

/** A request to these routes is a few fields: 8 KB is ample (a Google ID token is under 2 KB). */
const MAX_BODY_BYTES = 8 * 1024

const STATUS: Readonly<Record<AuthErrorCode, 400 | 401 | 403 | 404 | 429 | 503>> = {
  'bad-request': 400,
  'rate-limited': 429,
  unauthorized: 401,
  'invalid-token': 400,
  'fresh-login-required': 403,
  'plan-limit': 403,
  'not-found': 404,
  unavailable: 503,
}

/** The account the library has, as the page reads it. */
export interface AccountUser {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly language?: string | null
  readonly createdAt: Date | string
}

export function summarize(user: AccountUser): AccountSummary {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    language: user.language === 'ar' || user.language === 'en' ? user.language : null,
    createdAt: new Date(user.createdAt).toISOString(),
  }
}

export type SessionRead =
  | { readonly kind: 'user'; readonly user: AccountUser; readonly cookies: readonly string[] }
  | { readonly kind: 'none' }
  | { readonly kind: 'failed' }

/** Whether a request carries our session cookie at all: without one, nothing is looked up. */
export function hasSessionCookie(cookieHeader: string | undefined): boolean {
  if (cookieHeader === undefined) return false
  return cookieHeader.split(';').some((part) => {
    const name = part.trim().split('=')[0]
    return name === SESSION_COOKIE || name === `__Secure-${SESSION_COOKIE}`
  })
}

/** What a library call came to: a status, its Set-Cookie lines, and its JSON body if it had one. */
interface Called {
  readonly status: number
  readonly cookies: readonly string[]
  readonly body: unknown
  readonly code: string | null
}

const UNAVAILABLE: Called = { status: 503, cookies: [], body: null, code: null }

async function call(run: () => Promise<Response>, tell: (error: unknown) => void): Promise<Called> {
  try {
    const response = await run()
    const text = await response.text()
    let body: unknown = null
    try {
      body = text === '' ? null : (JSON.parse(text) as unknown)
    } catch {
      body = null
    }
    const code =
      typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string'
        ? body.code
        : null
    return { status: response.status, cookies: response.headers.getSetCookie(), body, code }
  } catch (thrown) {
    // The library throws its own validation errors, whatever `asResponse` says.
    const status =
      typeof thrown === 'object' && thrown !== null && 'statusCode' in thrown
        ? Number(thrown.statusCode)
        : 0
    const code =
      typeof thrown === 'object' && thrown !== null && 'body' in thrown
        ? (((thrown.body as { code?: unknown } | undefined)?.code as string | undefined) ?? null)
        : null
    if (status >= 400 && status < 500) return { status, cookies: [], body: null, code }
    tell(thrown)
    return UNAVAILABLE
  }
}

/**
 * The account routes (M4.1): thin routes of ours over `auth.api`, with the guards the scan route
 * has (the site's origin, JSON, a size limit, a limit per visitor). The library's own HTTP
 * surface is not exposed, except Google's callback; everything else under /api/auth is a 404.
 */
export function mountAccounts(
  app: Hono,
  deps: ApiDeps & { accounts: AccountsDeps },
): SessionAccess {
  const { auth, limits, secureCookies, data, plans } = deps.accounts
  const now = deps.now ?? (() => new Date())
  const told = quietly('Accounts', deps.log)
  // By its message alone, once in a while: never what the library holds (a profile, a token).
  const tell = (thrown: unknown) => {
    told(new Error(thrown instanceof Error ? thrown.message : 'The accounts library failed'))
  }
  const foreign = told

  const fail = (c: Context, error: AuthErrorCode, retryAfterSeconds?: number) => {
    const body: AuthErrorResponse =
      retryAfterSeconds === undefined ? { error } : { error, retryAfterSeconds }
    if (retryAfterSeconds !== undefined) c.header('Retry-After', String(retryAfterSeconds))
    return c.json(body, STATUS[error])
  }

  const fromTheSiteOnly = fromTheSite({
    origin: deps.origin,
    json: false,
    refuse: (c) => fail(c, 'bad-request'),
    foreign,
  })
  const fromTheSiteJson = fromTheSite({
    origin: deps.origin,
    json: true,
    refuse: (c) => fail(c, 'bad-request'),
    foreign,
  })
  const small = bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => fail(c, 'bad-request') })

  /** The body, checked against its schema; null when it is not what the route takes. */
  const parse = async <T>(c: Context, schema: ZodType<T>): Promise<T | null> => {
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      return null
    }
    const result = schema.safeParse(raw)
    return result.success ? result.data : null
  }

  /**
   * A visitor's requests to the sign-in routes are counted, valid or not, before the library is
   * asked anything. Returns what to send when the visitor may not go on.
   */
  const throttle = async (
    c: Context,
  ): Promise<{ error: 'rate-limited' | 'unavailable'; retry?: number } | null> => {
    const address = deps.address(c)
    // Without the visitor's address there is no limit to keep, so there is no sign-in.
    if (address === null) return { error: 'unavailable' }
    const at = now()
    const taken = await deps.limiter.take(
      `auth:signin:${deps.connectionKey(address, at)}`,
      limits.signIn,
      at.getTime(),
    )
    return taken.ok ? null : { error: 'rate-limited', retry: taken.retryAfterSeconds }
  }

  const sessionCookieName = `${secureCookies ? '__Secure-' : ''}${SESSION_COOKIE}`
  /** The cookie, emptied: what the library sends on sign-out, said again in case it sent none. */
  const cleared = `${sessionCookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secureCookies ? '; Secure' : ''}`
  const withCookies = (c: Context, cookies: readonly string[]) => {
    for (const cookie of cookies) c.header('Set-Cookie', cookie, { append: true })
  }

  const readSession = async (c: Context): Promise<SessionRead> => {
    if (!hasSessionCookie(c.req.header('cookie'))) return { kind: 'none' }
    try {
      const { headers, response } = await auth.api.getSession({
        headers: c.req.raw.headers,
        returnHeaders: true,
      })
      if (response === null) return { kind: 'none' }
      // A refreshed session comes with its cookie again: handed on, or it would lapse at the old date.
      return { kind: 'user', user: response.user, cookies: headers.getSetCookie() }
    } catch (thrown) {
      tell(thrown)
      return { kind: 'failed' }
    }
  }

  const signedIn = async (
    c: Context,
  ): Promise<Extract<SessionRead, { kind: 'user' }> | Response> => {
    const read = await readSession(c)
    if (read.kind === 'failed') return fail(c, 'unavailable')
    if (read.kind === 'none') return fail(c, 'unauthorized')
    return read
  }

  // Where Google sends the browser after consent, and where an error goes, in the page's language.
  const pages = (lang: Language) => {
    const prefix = lang === 'en' ? '/en' : ''
    return {
      callbackURL: `${prefix}${ACCOUNT_PAGE_PATH}`,
      errorCallbackURL: `${prefix}${LOGIN_PAGE_PATH}`,
    }
  }

  app.post(SESSION_GOOGLE_PATH, fromTheSiteJson, small, async (c) => {
    const request = await parse(c, GoogleStartRequest)
    if (request === null) return fail(c, 'bad-request')
    const limited = await throttle(c)
    if (limited !== null) return fail(c, limited.error, limited.retry)
    const started = await call(
      () =>
        auth.api.signInSocial({
          body: { provider: 'google', disableRedirect: true, ...pages(request.lang) },
          headers: c.req.raw.headers,
          asResponse: true,
        }),
      tell,
    )
    const url =
      typeof started.body === 'object' && started.body !== null && 'url' in started.body
        ? started.body.url
        : null
    if (started.status !== 200 || typeof url !== 'string') return fail(c, 'unavailable')
    withCookies(c, started.cookies)
    return c.json({ url })
  })

  app.post(SESSION_ONE_TAP_PATH, fromTheSiteJson, small, async (c) => {
    const request = await parse(c, OneTapRequest)
    if (request === null) return fail(c, 'bad-request')
    const limited = await throttle(c)
    if (limited !== null) return fail(c, limited.error, limited.retry)
    const signedInNow = await call(
      () =>
        auth.api.oneTapCallback({
          body: { idToken: request.credential },
          headers: c.req.raw.headers,
          asResponse: true,
        }),
      tell,
    )
    if (signedInNow.status >= 500) return fail(c, 'unavailable')
    const user =
      typeof signedInNow.body === 'object' &&
      signedInNow.body !== null &&
      'user' in signedInNow.body
        ? (signedInNow.body.user as AccountUser)
        : null
    // Any refusal (a token that is not Google's, another client's, expired, an address Google
    // does not vouch for) is the same answer: there is nothing to tell a forger.
    if (signedInNow.status !== 200 || user === null) return fail(c, 'invalid-token')
    withCookies(c, signedInNow.cookies)
    return c.json(summarize(user))
  })

  app.get(GOOGLE_CALLBACK_PATH, async (c) => {
    const limited = await throttle(c)
    if (limited !== null) {
      return c.redirect(`${LOGIN_PAGE_PATH}?error=${limited.error}`, 302)
    }
    try {
      const answer = await auth.handler(c.req.raw)
      // The library answers a sign-in with a redirect; anything else is a failure it did not
      // turn into one, and the browser is better sent back to the sign-in page than shown JSON.
      if (answer.status >= 300 && answer.status < 400) return answer
      return c.redirect(`${LOGIN_PAGE_PATH}?error=failed`, 302)
    } catch (thrown) {
      tell(thrown)
      return c.redirect(`${LOGIN_PAGE_PATH}?error=unavailable`, 302)
    }
  })

  app.delete(SESSION_PATH, fromTheSiteOnly, async (c) => {
    if (hasSessionCookie(c.req.header('cookie'))) {
      const out = await call(
        () => auth.api.signOut({ headers: c.req.raw.headers, asResponse: true }),
        tell,
      )
      if (out.status >= 500) return fail(c, 'unavailable')
    }
    c.header('Set-Cookie', cleared, { append: true })
    return c.body(null, 204)
  })

  app.delete(SESSIONS_PATH, fromTheSiteOnly, async (c) => {
    const read = await signedIn(c)
    if (read instanceof Response) return read
    const revoked = await call(
      () => auth.api.revokeSessions({ headers: c.req.raw.headers, asResponse: true }),
      tell,
    )
    if (revoked.status >= 400) return fail(c, 'unavailable')
    c.header('Set-Cookie', cleared, { append: true })
    return c.body(null, 204)
  })

  app.get(ACCOUNT_PATH, async (c) => {
    const read = await signedIn(c)
    if (read instanceof Response) return read
    withCookies(c, read.cookies)
    return c.json(summarize(read.user))
  })

  app.patch(ACCOUNT_PATH, fromTheSiteJson, small, async (c) => {
    const request = await parse(c, AccountPatch)
    if (request === null) return fail(c, 'bad-request')
    const read = await signedIn(c)
    if (read instanceof Response) return read
    try {
      const { internalAdapter } = await auth.$context
      await internalAdapter.updateUser(read.user.id, { language: request.language })
    } catch (thrown) {
      tell(thrown)
      return fail(c, 'unavailable')
    }
    withCookies(c, read.cookies)
    return c.json(summarize({ ...read.user, language: request.language }))
  })

  app.delete(ACCOUNT_PATH, fromTheSiteJson, small, async (c) => {
    const request = await parse(c, DeleteAccountRequest)
    if (request === null) return fail(c, 'bad-request')
    const read = await signedIn(c)
    if (read instanceof Response) return read
    const deleted = await call(
      () => auth.api.deleteUser({ body: {}, headers: c.req.raw.headers, asResponse: true }),
      tell,
    )
    // The session is too old to erase an account with no password to ask for: sign in again.
    if (deleted.code === 'SESSION_EXPIRED') return fail(c, 'fresh-login-required')
    if (deleted.status !== 200) return fail(c, 'unavailable')
    c.header('Set-Cookie', cleared, { append: true })
    return c.body(null, 204)
  })
  return {
    identify: async (c) => {
      const read = await readSession(c)
      return read.kind === 'user' ? read.user : null
    },
    require: signedIn,
    fail,
    data,
    plans,
  }
}
