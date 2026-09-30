import type { Report } from '@arablyzer/report-schema'
import {
  MAX_SCANNER_EVENTS,
  SCAN_PATH,
  ScannerLine,
  type ScannerEvent,
  type ScanRequest,
} from './protocol'

/**
 * A scan: its steps' events as they happen, then its report. It throws when the scan could not
 * run; a page a scan could not fetch is a report, not a throw. A scan that never began, because
 * the scanner was not there to take it, throws ScannerUnavailable: it may be asked for again.
 */
export type Scanner = (
  request: ScanRequest,
  onEvent: (event: ScannerEvent) => void,
  signal?: AbortSignal,
) => Promise<Report>

/**
 * The engine's budget for a whole scan (BUILD-PLAN §11), as `@arablyzer/engine/budgets` has it;
 * the scanner's tests check the two agree. Written here so the worker loads no engine.
 */
export const SCAN_BUDGET_MS = 120_000
/** How long the worker waits for the scanner: the budget, and as long again for what is around it. */
export const SCANNER_TIMEOUT_MS = 2 * SCAN_BUDGET_MS
/** The longest line read: a report is far smaller, even at its caps. */
const MAX_LINE_LENGTH = 8 * 1024 * 1024

export type Fetcher = (input: string, init: RequestInit) => Promise<Response>

/**
 * The scanner did not take the scan: a connection refused, a name that resolves to nothing, or a
 * 503 before it sent a line (busy). Nothing of the scan has run, so asking again is safe;
 * anything after the scanner took it is not this.
 */
export class ScannerUnavailable extends Error {}

/**
 * What a connection that never reached the scanner fails with: nothing was sent, or nothing that
 * a scanner could have read. Measured against Docker's restart policy (docs/design/plans/
 * m3.1-security.md): a container being started refuses the connection, and one waiting for its
 * restart has no name in Docker's DNS, so a name not found is a port with nothing behind it. A
 * reset or a closed socket may come after the scan began, and is not here.
 */
const NOT_THERE: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
])

/** The system's code, which fetch keeps in the cause of its `fetch failed`, or in its causes. */
function connectionCode(error: unknown): string | null {
  for (let cause = error, depth = 0; cause instanceof Error && depth < 4; depth++) {
    const { code } = cause as { code?: unknown }
    if (typeof code === 'string' && NOT_THERE.has(code)) return code
    cause = cause.cause
  }
  return null
}

/**
 * The scanner, from the worker (M2.1 plan §5b). Its answer is read line by line, and each line
 * is checked against the protocol before the worker publishes or stores anything of it, so a
 * scanner that a page compromised can hand the worker nothing but a scan's events and a report.
 */
export function remoteScanner(
  endpoint: string,
  token: string,
  fetcher: Fetcher = fetch,
  timeoutMs = SCANNER_TIMEOUT_MS,
): Scanner {
  const url = new URL(SCAN_PATH, endpoint).href
  return async (request, onEvent, signal) => {
    const deadline = AbortSignal.timeout(timeoutMs)
    let response: Response
    try {
      response = await fetcher(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          url: request.url,
          ...(request.tool === undefined ? {} : { tool: request.tool }),
        }),
        signal: signal === undefined ? deadline : AbortSignal.any([deadline, signal]),
      })
    } catch (error) {
      const code = connectionCode(error)
      if (code === null) throw error
      throw new ScannerUnavailable(`The scanner is not there (${code})`, { cause: error })
    }
    if (response.status !== 200 || response.body === null) {
      await response.body?.cancel()
      const answered = `The scanner answered ${response.status}`
      // Busy, or ending its process after its last scan (apps/scanner): it took nothing.
      throw response.status === 503 ? new ScannerUnavailable(answered) : new Error(answered)
    }
    let events = 0
    for await (const line of lines(response.body)) {
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        throw new Error('The scanner sent a line that is not JSON')
      }
      const checked = ScannerLine.safeParse(parsed)
      if (!checked.success) throw new Error('The scanner sent a line its protocol does not have')
      const message = checked.data
      if (message.type === 'event') {
        if (++events > MAX_SCANNER_EVENTS)
          throw new Error('The scanner sent more events than a scan has')
        // The protocol's check has refused every event that is not a scan's own step.
        onEvent(message.event as ScannerEvent)
      } else if (message.type === 'report') return message.report
      else throw new Error(`The scanner could not run the scan: ${message.message}`)
    }
    throw new Error('The scanner ended its answer without a report')
  }
}

/** The body's lines, as UTF-8 text, none longer than MAX_LINE_LENGTH. */
async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  let buffered = ''
  for await (const chunk of body) {
    buffered += decoder.decode(chunk, { stream: true })
    for (let newline = buffered.indexOf('\n'); newline >= 0; newline = buffered.indexOf('\n')) {
      const line = buffered.slice(0, newline)
      buffered = buffered.slice(newline + 1)
      if (line.trim() !== '') yield line
    }
    if (buffered.length > MAX_LINE_LENGTH) throw new Error('A line from the scanner is too long')
  }
  buffered += decoder.decode()
  if (buffered.trim() !== '') yield buffered
}
