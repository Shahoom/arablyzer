import type { Report } from '@arablyzer/report-schema'
import { MAX_SCANNER_EVENTS, SCAN_PATH, ScannerLine, type ScannerEvent } from './protocol'

/**
 * A scan: its steps' events as they happen, then its report. It throws when the scan could not
 * run; a page a scan could not fetch is a report, not a throw.
 */
export type Scanner = (
  url: string,
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
  return async (target, onEvent, signal) => {
    const deadline = AbortSignal.timeout(timeoutMs)
    const response = await fetcher(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ url: target }),
      signal: signal === undefined ? deadline : AbortSignal.any([deadline, signal]),
    })
    if (response.status !== 200 || response.body === null) {
      await response.body?.cancel()
      throw new Error(`The scanner answered ${response.status}`)
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
