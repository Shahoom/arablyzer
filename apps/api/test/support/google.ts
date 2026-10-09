import { createSign, generateKeyPairSync } from 'node:crypto'
import { vi } from 'vitest'

// A stand-in for Google, for tests: an RSA key whose public half is "Google's certs", ID tokens
// signed with it, and the two endpoints the library calls, on a stubbed global `fetch`.
export const CLIENT_ID = 'test-client.apps.googleusercontent.com'
export const CLIENT_SECRET = 'test-client-secret'
const KID = 'test-key'
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })

const b64 = (value: string | Buffer): string => Buffer.from(value).toString('base64url')

export interface Claims {
  readonly sub?: string
  readonly email?: string | null
  readonly email_verified?: boolean
  readonly name?: string
  readonly picture?: string
  readonly aud?: string
  readonly iss?: string
  readonly iat?: number
  readonly exp?: number
}

/** An ID token as Google signs it. Claims set to `null` are left out. */
export function idToken(claims: Claims = {}): string {
  const now = Math.floor(Date.now() / 1000)
  const body: Record<string, unknown> = {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: '1234567890',
    email: 'ali@example.com',
    email_verified: true,
    name: 'Ali',
    picture: 'https://lh3.googleusercontent.com/a/photo',
    iat: now,
    exp: now + 3600,
    ...claims,
  }
  const present = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== null))
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID }))
  const payload = b64(JSON.stringify(present))
  const signature = createSign('RSA-SHA256').update(`${head}.${payload}`).sign(privateKey)
  return `${head}.${payload}.${b64(signature)}`
}

export interface GoogleStub {
  /** Every request the library made: method, URL and form body. */
  readonly calls: { method: string; url: string; body: string }[]
  /** What the token endpoint answers with next: an ID token. */
  tokenEndpointIdToken: string
}

/** Stubs the global `fetch` for Google's two endpoints; anything else fails the test. */
export function stubGoogle(initial: string = idToken()): GoogleStub {
  const stub: GoogleStub = { calls: [], tokenEndpointIdToken: initial }
  vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const body =
      init?.body instanceof URLSearchParams
        ? init.body.toString()
        : typeof init?.body === 'string'
          ? init.body
          : ''
    stub.calls.push({ method, url, body })
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') {
      const jwk = publicKey.export({ format: 'jwk' })
      return Promise.resolve(
        Response.json({ keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] }),
      )
    }
    if (url === 'https://oauth2.googleapis.com/token') {
      return Promise.resolve(
        Response.json({
          access_token: 'never-kept-access',
          refresh_token: 'never-kept-refresh',
          id_token: stub.tokenEndpointIdToken,
          expires_in: 3600,
          scope: 'openid email profile',
          token_type: 'Bearer',
        }),
      )
    }
    return Promise.reject(new Error(`Unexpected request to ${url}`))
  })
  return stub
}
