import {
  ACCOUNT_SCANS_PATH,
  ALERTS_PATH,
  ALERTS_TEST_EMAIL_PATH,
  ALERTS_TEST_PATH,
  WHATSAPP_PATH,
  WHATSAPP_VERIFY_PATH,
  siteMonitorPath,
  sitePath,
  siteWhatsappPath,
  SITES_PATH,
  siteScansPath,
  type AccountScansResponse,
  type AlertSettings,
  type AlertsChange,
  type AlertsResponse,
  type MonitorSummary,
  type SiteSummary,
  type SitesResponse,
  type WebhookTestResponse,
  type WhatsappState,
} from '@arablyzer/api-contract/codes'
import {
  isAccountScansResponse,
  isAlertSettings,
  isAlertsResponse,
  isMonitorResponse,
  isTestResponse,
  isSiteSummary,
  isSitesResponse,
  isWhatsappState,
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

export async function request(
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

export async function jsonOf(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function read<T>(
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

/** Turns a saved site's monitoring on (its summary) or off (null). */
export async function setMonitor(
  id: string,
  enabled: boolean,
  send: typeof fetch = fetch,
): Promise<SiteOutcome<MonitorSummary | null>> {
  const outcome = await read(
    await request(send, 'PUT', siteMonitorPath(id), { enabled }),
    isMonitorResponse,
  )
  return outcome.ok ? { ok: true, value: outcome.value.monitor } : outcome
}

export async function getAlerts(send: typeof fetch = fetch): Promise<SiteOutcome<AlertSettings>> {
  return read(await request(send, 'GET', ALERTS_PATH), isAlertSettings)
}

/** Saves what is given and leaves the rest; the answer carries the signing secret once, when one was made. */
export async function saveAlerts(
  change: AlertsChange,
  send: typeof fetch = fetch,
): Promise<SiteOutcome<AlertsResponse>> {
  return read(await request(send, 'PUT', ALERTS_PATH, change), isAlertsResponse)
}

/** A test message to the account's own address (M5.5). */
export async function testEmailAlerts(
  send: typeof fetch = fetch,
): Promise<SiteOutcome<WebhookTestResponse>> {
  return read(await request(send, 'POST', ALERTS_TEST_EMAIL_PATH), isTestResponse)
}

export async function testAlerts(
  send: typeof fetch = fetch,
): Promise<SiteOutcome<WebhookTestResponse>> {
  return read(await request(send, 'POST', ALERTS_TEST_PATH), isTestResponse)
}

/** Sends a confirmation code to the number on WhatsApp (M5.6); the answer is the account's WhatsApp state. */
export async function sendWhatsappCode(
  phone: string,
  send: typeof fetch = fetch,
): Promise<SiteOutcome<WhatsappState>> {
  return read(await request(send, 'PUT', WHATSAPP_PATH, { phone }), isWhatsappState)
}

/** Gives the code back; a wrong or late one is the `invalid-token` problem. */
export async function verifyWhatsappCode(
  code: string,
  send: typeof fetch = fetch,
): Promise<SiteOutcome<WhatsappState>> {
  return read(await request(send, 'POST', WHATSAPP_VERIFY_PATH, { code }), isWhatsappState)
}

/** Forgets the number and every site's opt-in. */
export async function removeWhatsapp(
  send: typeof fetch = fetch,
): Promise<SiteOutcome<WhatsappState>> {
  return read(await request(send, 'DELETE', WHATSAPP_PATH), isWhatsappState)
}

/** Opts a monitored site in or out of WhatsApp alerts. */
export async function setWhatsappSite(
  id: string,
  enabled: boolean,
  send: typeof fetch = fetch,
): Promise<SiteOutcome<WhatsappState>> {
  return read(await request(send, 'PUT', siteWhatsappPath(id), { enabled }), isWhatsappState)
}
