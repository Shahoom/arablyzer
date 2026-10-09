import { FRESH_LOGIN_SECONDS, LOGIN_PAGE_PATH } from '@arablyzer/api-contract'
import { betterAuth } from 'better-auth'
import type { memoryAdapter } from 'better-auth/adapters/memory'
import { oneTap } from 'better-auth/plugins'
import { USER_FIELDS } from './auth-fields'

/** The cookie's name before Better Auth adds its `__Secure-` prefix and the `.session_token` suffix. */
export const COOKIE_PREFIX = 'arablyzer'
export const SESSION_COOKIE = `${COOKIE_PREFIX}.session_token`
/** A session lasts this long since its last refresh, as the library's default has it. */
export const SESSION_SECONDS = 7 * 24 * 3600

/** What `drizzleAdapter` and `memoryAdapter` give: the library's own union is wider than it can type here. */
export type AuthDatabase = ReturnType<typeof memoryAdapter>

export interface AuthDeps {
  readonly site: URL
  /** BETTER_AUTH_SECRET: at least 32 characters. */
  readonly secret: string
  /** Drizzle adapter (server.ts) or memoryAdapter (dev, tests). */
  readonly database: AuthDatabase
  /** Sign-in is Google's alone in M4.1: the OAuth client's id and secret. */
  readonly google: { readonly clientId: string; readonly clientSecret: string }
  readonly production: boolean
  /** Where a problem the library meets is told: never with an address, token or profile. */
  readonly log: (message: string) => void
}

const MIN_SECRET_LENGTH = 32

/**
 * Better Auth, inside the API (M4.1): Google's code flow (scopes `openid email profile`, PKCE) and
 * One Tap's ID-token callback, and sessions in PostgreSQL. Nothing else of the library is exposed:
 * apps/api/src/accounts.ts calls `auth.api` from routes of ours, which carry the guards the scan
 * route has. No password exists. What is kept (BUILD-PLAN §14): an address, a name, a language.
 * Never an IP address, a User-Agent, an OAuth token or a picture: the hooks below empty them.
 */
export function createAuth(deps: AuthDeps) {
  const { site, production } = deps
  if (production && deps.secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`BETTER_AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters`)
  }
  if (production && site.protocol !== 'https:') {
    throw new Error('Accounts need ARABLYZER_SITE to be an https address in production')
  }
  return betterAuth({
    appName: 'Arablyzer',
    baseURL: site.origin,
    secret: deps.secret,
    database: deps.database,
    trustedOrigins: [site.origin],
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: deps.google.clientId,
        clientSecret: deps.google.clientSecret,
        // The scopes of this sign-in alone: Search Console's are asked for on their own, never
        // folded into the account.
        includeGrantedScopes: false,
      },
    },
    plugins: [oneTap()],
    // The library's defaults (7 days, refreshed once a day), and "fresh" for ten minutes: erasing
    // the account needs a sign-in that recent (it has no password to ask for).
    session: { expiresIn: SESSION_SECONDS, freshAge: FRESH_LOGIN_SECONDS },
    user: {
      additionalFields: USER_FIELDS,
      deleteUser: { enabled: true },
      // An address Google does not vouch for is no identity: no account and no session.
      validateUserInfo: ({ user }) => {
        if (typeof user.email !== 'string' || user.email === '') return { error: 'email_missing' }
        if (user.emailVerified !== true) return { error: 'email_not_verified' }
        return undefined
      },
    },
    account: { accountLinking: { enabled: true, trustedProviders: ['google'] } },
    // Ours are in front (apps/api/src/accounts.ts), counted before any call into the library.
    rateLimit: { enabled: false },
    advanced: {
      cookiePrefix: COOKIE_PREFIX,
      useSecureCookies: production,
      ipAddress: { disableIpTracking: true },
    },
    telemetry: { enabled: false },
    onAPIError: { errorURL: site.origin + LOGIN_PAGE_PATH },
    databaseHooks: {
      user: {
        create: { before: (user) => Promise.resolve({ data: { ...user, image: null } }) },
      },
      session: {
        create: {
          before: (session) =>
            Promise.resolve({ data: { ...session, ipAddress: null, userAgent: null } }),
        },
      },
      account: {
        create: { before: (account) => Promise.resolve({ data: withoutTokens(account) }) },
        update: { before: (account) => Promise.resolve({ data: withoutTokens(account) }) },
      },
    },
    logger: {
      // The library's own messages can hold a profile or a token in an error: told by level only.
      log: (level) => {
        if (level === 'error') deps.log('Better Auth reported an error')
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>

/** An OAuth account without the tokens Google gave: the identity is all that is kept. */
function withoutTokens<T extends object>(account: T): T {
  return {
    ...account,
    accessToken: null,
    refreshToken: null,
    idToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
  }
}
