import { ApiError, TERMINAL_STATES, type ApiClient, type Scan } from './client'

/**
 * How long to wait before asking again, in milliseconds: a scan takes about half a minute, so the
 * first questions are a few seconds apart and later ones further (the last delay repeats). The API
 * allows a key 120 requests a minute; this keeps one waiting scan far below it.
 */
export const POLL_DELAYS_MS: readonly number[] = [3000, 3000, 4000, 5000, 6000, 8000, 10_000]

/** The longest pause taken from a `Retry-After`; a scan's wait is bounded by `timeoutMs` anyway. */
const MAX_RETRY_AFTER_MS = 60_000
/** Failures in a row (the service restarting, a dropped connection) before the wait gives up. */
const MAX_TRANSIENT = 4

export interface WaitOptions {
  readonly client: Pick<ApiClient, 'getScan'>
  readonly scanId: string
  /** The scan as it was started: its state may already be final (a reused scan). */
  readonly first?: Scan
  readonly timeoutMs: number
  readonly sleep: (ms: number) => Promise<void>
  readonly now: () => number
  /** Called with each state the scan is seen in. */
  readonly onState?: (scan: Scan) => void
}

/** Waits until the scan is complete, partial or failed; throws `timeout` if it takes longer than asked. */
export async function waitForScan(options: WaitOptions): Promise<Scan> {
  const { client, scanId, timeoutMs, sleep, now } = options
  const deadline = now() + timeoutMs
  let scan = options.first
  let step = 0
  let transient = 0
  for (;;) {
    if (scan !== undefined) {
      options.onState?.(scan)
      if (TERMINAL_STATES.includes(scan.state)) return scan
    }
    const base = POLL_DELAYS_MS[Math.min(step, POLL_DELAYS_MS.length - 1)] ?? 10_000
    step++
    if (now() + base > deadline) {
      throw new ApiError('timeout', 'The scan did not finish in the time given.', 0)
    }
    await sleep(base)
    try {
      scan = await client.getScan(scanId)
      transient = 0
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      if (error.code === 'rate_limited') {
        const pause = Math.min((error.retryAfterSeconds ?? 10) * 1000, MAX_RETRY_AFTER_MS)
        if (now() + pause > deadline) {
          throw new ApiError('timeout', 'The scan did not finish in the time given.', 0)
        }
        await sleep(pause)
        continue
      }
      const retryable = error.code === 'network' || error.code === 'unavailable'
      if (!retryable || ++transient >= MAX_TRANSIENT) throw error
    }
  }
}
