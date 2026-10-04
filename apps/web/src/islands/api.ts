import {
  GSC_STATUS_PATH,
  gscResultPath,
  reportPath,
  SCANS_PATH,
  scanPath,
  type CreateScanRequest,
  type GscResult,
  type ScanSummary,
} from '@arablyzer/api-contract/codes'
import type { Report } from '@arablyzer/report-schema'
import { readScanStart, type ScanStart } from './scan-request'

/**
 * The site's requests to Arablyzer's API, on the same origin: starting a scan, and reading it
 * and its report. They are not scan traffic, which leaves only through the egress proxy on the
 * server (CLAUDE.md, §13).
 */
export async function startScan(
  body: CreateScanRequest,
  send: typeof fetch = fetch,
): Promise<ScanStart> {
  let response: Response
  try {
    response = await send(SCANS_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
    })
  } catch {
    return { ok: false, error: { code: 'network' } }
  }
  return readScanStart(response)
}

export type Loaded<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: 'missing' | 'not-ready' | 'offline' }

/** A GET of the API's JSON: missing on 404, not ready on 409, offline on anything else. */
async function getJson(path: string, send: typeof fetch): Promise<Loaded<unknown>> {
  let response: Response
  try {
    response = await send(path, { credentials: 'omit', headers: { accept: 'application/json' } })
  } catch {
    return { ok: false, reason: 'offline' }
  }
  if (response.status === 404) return { ok: false, reason: 'missing' }
  if (response.status === 409) return { ok: false, reason: 'not-ready' }
  if (!response.ok) return { ok: false, reason: 'offline' }
  try {
    return { ok: true, value: await response.json() }
  } catch {
    return { ok: false, reason: 'offline' }
  }
}

/** The scan the report page follows: its URL and where it is. */
export async function fetchSummary(
  id: string,
  send: typeof fetch = fetch,
): Promise<Loaded<ScanSummary>> {
  const loaded = await getJson(scanPath(id), send)
  if (!loaded.ok) return loaded
  const value = loaded.value as Partial<ScanSummary> | null
  return typeof value?.url === 'string' && typeof value.state === 'string'
    ? { ok: true, value: value as ScanSummary }
    : { ok: false, reason: 'offline' }
}

/** The finished scan's report. */
export async function fetchReport(id: string, send: typeof fetch = fetch): Promise<Loaded<Report>> {
  const loaded = await getJson(reportPath(id), send)
  if (!loaded.ok) return loaded
  const value = loaded.value as Partial<Report> | null
  return typeof value?.scan === 'object' && Array.isArray(value.rules)
    ? { ok: true, value: value as Report }
    : { ok: false, reason: 'offline' }
}

/** Whether the site can connect Google Search Console (the API has an OAuth client); false if unsure. */
export async function fetchGscStatus(send: typeof fetch = fetch): Promise<boolean> {
  const loaded = await getJson(GSC_STATUS_PATH, send)
  return (
    loaded.ok &&
    typeof loaded.value === 'object' &&
    loaded.value !== null &&
    (loaded.value as { enabled?: unknown }).enabled === true
  )
}

/** A Search Console result, which the API gives once: the next read finds it gone. */
export async function fetchGscResult(
  id: string,
  send: typeof fetch = fetch,
): Promise<Loaded<GscResult>> {
  const loaded = await getJson(gscResultPath(id), send)
  if (!loaded.ok) return loaded
  const value = loaded.value as Partial<GscResult> | null
  return typeof value?.period === 'object' &&
    Array.isArray(value.queries) &&
    Array.isArray(value.pages) &&
    Array.isArray(value.countries)
    ? { ok: true, value: value as GscResult }
    : { ok: false, reason: 'offline' }
}
