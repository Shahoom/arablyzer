import {
  ACCOUNT_PATH,
  SESSION_GOOGLE_PATH,
  SESSION_ONE_TAP_PATH,
  SESSION_PATH,
  SESSIONS_PATH,
  type AccountSummary,
  type Language,
} from '@arablyzer/api-contract/codes'
import { isAccountSummary, problemOf, type AuthProblem } from './auth-model'

/**
 * The site's requests to the account routes, on the same origin (M4.1). Not scan traffic, which
 * leaves the server through the egress proxy. The browser sends the session cookie to these and
 * no referrer anywhere; no token or address is ever put in a URL.
 */
export type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problem: AuthProblem; readonly retryAfterSeconds?: number }

async function request(
  send: typeof fetch,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response | null> {
  try {
    return await send(path, {
      method,
      credentials: 'same-origin',
      referrerPolicy: 'no-referrer',
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch {
    return null
  }
}

/** The JSON of an answer, or null when it holds none (a proxy's page, an empty body). */
async function jsonOf(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function failure(response: Response): Promise<Outcome<never>> {
  return { ok: false, ...problemOf(response.status, await jsonOf(response)) }
}

async function account(response: Response | null): Promise<Outcome<AccountSummary>> {
  if (response === null) return { ok: false, problem: 'network' }
  if (!response.ok) return failure(response)
  const body = await jsonOf(response)
  return isAccountSummary(body) ? { ok: true, value: body } : { ok: false, problem: 'unavailable' }
}

async function done(response: Response | null): Promise<Outcome<null>> {
  if (response === null) return { ok: false, problem: 'network' }
  if (response.ok) return { ok: true, value: null }
  return failure(response)
}

/** Signs in with the ID token Google gave the page (One Tap, or its button). */
export async function signInWithCredential(
  credential: string,
  send: typeof fetch = fetch,
): Promise<Outcome<AccountSummary>> {
  return account(await request(send, 'POST', SESSION_ONE_TAP_PATH, { credential }))
}

/** Where to send the browser to sign in on Google's own page. */
export async function startGoogle(
  lang: Language,
  send: typeof fetch = fetch,
): Promise<Outcome<string>> {
  const response = await request(send, 'POST', SESSION_GOOGLE_PATH, { lang })
  if (response === null) return { ok: false, problem: 'network' }
  if (!response.ok) return failure(response)
  const body = await jsonOf(response)
  const url = typeof body === 'object' && body !== null ? (body as { url?: unknown }).url : null
  // Only Google's own address is gone to: whatever else the answer holds is not followed.
  if (typeof url === 'string' && url.startsWith('https://accounts.google.com/')) {
    return { ok: true, value: url }
  }
  return { ok: false, problem: 'unavailable' }
}

/** The signed-in account, or null when nobody is signed in (a 401 is an answer, not a failure). */
export async function readAccount(
  send: typeof fetch = fetch,
): Promise<Outcome<AccountSummary | null>> {
  const response = await request(send, 'GET', ACCOUNT_PATH)
  if (response !== null && response.status === 401) return { ok: true, value: null }
  const read = await account(response)
  return read.ok ? { ok: true, value: read.value } : read
}

export async function setLanguage(
  language: Language,
  send: typeof fetch = fetch,
): Promise<Outcome<AccountSummary>> {
  return account(await request(send, 'PATCH', ACCOUNT_PATH, { language }))
}

export async function signOut(send: typeof fetch = fetch): Promise<Outcome<null>> {
  return done(await request(send, 'DELETE', SESSION_PATH))
}

export async function signOutEverywhere(send: typeof fetch = fetch): Promise<Outcome<null>> {
  return done(await request(send, 'DELETE', SESSIONS_PATH))
}

/** Erases the account. The page has asked the person to confirm first. */
export async function deleteAccount(send: typeof fetch = fetch): Promise<Outcome<null>> {
  return done(await request(send, 'DELETE', ACCOUNT_PATH, { confirm: true }))
}
