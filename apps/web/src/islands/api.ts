import { SCANS_PATH, type CreateScanRequest } from '@arablyzer/api-contract/codes'
import { readScanStart, type ScanStart } from './scan-request'

/**
 * The page's one request of its own: to Arablyzer's API, on the same origin. It is not scan
 * traffic, which leaves only through the egress proxy on the server (CLAUDE.md, §13).
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
