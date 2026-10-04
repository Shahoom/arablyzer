import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** The only scope asked: read-only Search Console data. */
export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'
export const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
export const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'

/** How long the visitor has to choose an account and agree: the cookie and the verifier live this long. */
export const FLOW_TTL_SECONDS = 600
export const COOKIE_NAME = 'arablyzer_gsc'

const base64url = (bytes: Buffer): string => bytes.toString('base64url')

/** A random value of `bytes` bytes, as 4/3 as many characters of base64url. */
export function randomToken(bytes: number): string {
  return base64url(randomBytes(bytes))
}

/** PKCE (RFC 7636): a 43-character verifier, and its S256 challenge. */
export function newPkce(): { readonly verifier: string; readonly challenge: string } {
  const verifier = randomToken(32)
  return { verifier, challenge: base64url(createHash('sha256').update(verifier).digest()) }
}

/** What the signed cookie holds: the flow's nonce (also the `state`), the report, the expiry (ms). */
export interface FlowCookie {
  readonly n: string
  readonly r: string
  readonly e: number
}

const mac = (key: Buffer, body: string): Buffer => createHmac('sha256', key).update(body).digest()

/** The cookie's value: the payload and its HMAC, so the browser can carry it and not change it. */
export function signFlow(key: Buffer, flow: FlowCookie): string {
  const body = base64url(Buffer.from(JSON.stringify(flow), 'utf8'))
  return `${body}.${base64url(mac(key, body))}`
}

/** The payload of a cookie this server signed and that has not expired; null for anything else. */
export function verifyFlow(key: Buffer, value: string | undefined, now: number): FlowCookie | null {
  const [body, signature, extra] = (value ?? '').split('.')
  if (body === undefined || signature === undefined || extra !== undefined) return null
  const given = Buffer.from(signature, 'base64url')
  const expected = mac(key, body)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const flow = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<FlowCookie>
    if (typeof flow.n !== 'string' || typeof flow.r !== 'string' || typeof flow.e !== 'number') {
      return null
    }
    return flow.e > now ? { n: flow.n, r: flow.r, e: flow.e } : null
  } catch {
    return null
  }
}

/** Whether two strings are the same, in time that does not tell where they first differ. */
export function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * Google's consent page for this flow: the authorization code flow with PKCE and a `state`; an
 * online token (no refresh token), and the account chooser every time.
 */
export function authorizationUrl(options: {
  readonly clientId: string
  readonly redirectUri: string
  readonly state: string
  readonly challenge: string
}): string {
  const url = new URL(AUTH_ENDPOINT)
  url.search = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: 'code',
    scope: GSC_SCOPE,
    state: options.state,
    code_challenge: options.challenge,
    code_challenge_method: 'S256',
    access_type: 'online',
    prompt: 'select_account',
    include_granted_scopes: 'false',
  }).toString()
  return url.href
}

/** The authorization code as Google gives it: visible ASCII, a sane length. */
export const CODE_PATTERN = /^[\x21-\x7e]{1,2048}$/
