import type { Window } from '@arablyzer/plans'
import type { Scanner } from '@arablyzer/scanner-client'
import { hostKey, hostLimitKey, type RateLimiter } from '@arablyzer/store'

export interface HostLimits {
  readonly limiter: RateLimiter
  /** The per-host window (packages/plans): the API's own, whose buckets this counts in. */
  readonly window: Window
  readonly now?: () => number
}

/** The key of the site a request asks for, or none where its URL cannot be read. */
function askedKey(url: string): string | null {
  try {
    return hostKey(new URL(url).hostname)
  } catch {
    return null
  }
}

/**
 * A scanner that counts the site a scan ends at, after its redirects, against the per-host limit
 * (security review, issue #30). The API counts the site a scan is asked for; a page that
 * redirects elsewhere would flood that site under another's name, and under as many first names
 * as a visitor liked. The engine says which site it reached with its `page` step, before any
 * browser renders the page: a site other than the one asked for takes one scan of its bucket (the
 * API's own, by hostLimitKey), and a site that has none left stops the scan there. So does a
 * limit that cannot be checked. The scan then fails, as any scan that cannot run does, and nothing
 * the log or the page is told names the site.
 */
export function hostLimited(scanner: Scanner, limits: HostLimits): Scanner {
  return async (request, onEvent, signal) => {
    const asked = askedKey(request.url)
    const stop = new AbortController()
    const outcome: { refusal: Error | null } = { refusal: null }
    let checking: Promise<void> = Promise.resolve()

    const check = async (host: string): Promise<void> => {
      if (hostKey(host) === asked) return
      try {
        const taken = await limits.limiter.take(
          hostLimitKey(host),
          limits.window,
          (limits.now ?? Date.now)(),
        )
        if (taken.ok) return
        outcome.refusal = new Error('The scan ended at a site that has reached its limit of scans')
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        outcome.refusal = new Error(
          `The limit of the site the scan ended at could not be checked: ${reason}`,
        )
      }
      stop.abort(outcome.refusal)
    }

    try {
      const report = await scanner(
        request,
        (event) => {
          onEvent(event)
          if (event.type === 'page' && event.host !== undefined) {
            const host = event.host
            checking = checking.then(() => check(host))
          }
        },
        signal === undefined ? stop.signal : AbortSignal.any([signal, stop.signal]),
      )
      // A scan can end before the limiter answers: it is refused all the same.
      await checking
      if (outcome.refusal !== null) throw outcome.refusal
      return report
    } catch (error) {
      await checking
      throw outcome.refusal ?? error
    }
  }
}
