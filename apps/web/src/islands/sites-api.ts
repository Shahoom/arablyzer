import {
  ACCOUNT_SCANS_PATH,
  sitePath,
  SITES_PATH,
  siteScansPath,
  type AccountScansResponse,
  type SiteSummary,
  type SitesResponse,
} from '@arablyzer/api-contract/codes'
import {
  isAccountScansResponse,
  isSiteSummary,
  isSitesResponse,
  siteProblemOf,
  type SiteProblem,
} from './sites-model'

/**
 * The account page's requests about saved sites and the history (M4.2), on the same origin with
 * the session cookie. Starting a scan from a saved site sends no Turnstile token: the person is
 * signed in, and the API asks for none.
 */
export type SiteOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problem: SiteProblem; readonly retryAfterSeconds?: number }

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

async function jsonOf(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function read<T>(
  response: Response | null,
  accept: (value: unknown) => value is T,
): Promise<SiteOutcome<T>> {
  if (response === null) return { ok: false, problem: 'network' }
  const body = await jsonOf(response)
  if (!response.ok) return { ok: false, ...siteProblemOf(response.status, body) }
  return accept(body) ? { ok: true, value: body } : { ok: false, problem: 'unavailable' }
}

export async function listSites(send: typeof fetch = fetch): Promise<SiteOutcome<SitesResponse>> {
  return read(await request(send, 'GET', SITES_PATH), isSitesResponse)
}

export async function listScans(
  send: typeof fetch = fetch,
): Promise<SiteOutcome<AccountScansResponse>> {
  return read(await request(send, 'GET', ACCOUNT_SCANS_PATH), isAccountScansResponse)
}

export async function addSite(
  url: string,
  send: typeof fetch = fetch,
): Promise<SiteOutcome<SiteSummary>> {
  return read(await request(send, 'POST', SITES_PATH, { url }), isSiteSummary)
}

export async function removeSite(
  id: string,
  send: typeof fetch = fetch,
): Promise<SiteOutcome<null>> {
  const response = await request(send, 'DELETE', sitePath(id))
  if (response === null) return { ok: false, problem: 'network' }
  if (response.ok) return { ok: true, value: null }
  return { ok: false, ...siteProblemOf(response.status, await jsonOf(response)) }
}

const isStarted = (value: unknown): value is { id: string } =>
  typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string'

/** Starts a scan of a saved site: the scan's id, whose page is the report. */
export async function scanSite(
  id: string,
  send: typeof fetch = fetch,
): Promise<SiteOutcome<{ id: string }>> {
  return read(await request(send, 'POST', siteScansPath(id)), isStarted)
}
