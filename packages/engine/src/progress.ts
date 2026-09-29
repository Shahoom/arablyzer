import type { LabStatus } from '@arablyzer/lab'
import type { Engine, RenderRun } from '@arablyzer/report-schema'

/**
 * A step of a scan as it happens, for a page that follows the scan live (M2.1b). Steps say what
 * the report will say, earlier; they never change it.
 */
export type ScanProgress =
  /** The scan has begun, and will render in these engines, in this order, if the page is HTML. */
  | { readonly step: 'start'; readonly engines: readonly Engine[] }
  | {
      /** The page: its HTTP status and type, or the egress code of why it could not be fetched. */
      readonly step: 'page'
      readonly status: number | null
      readonly contentType: string | null
      readonly error: string | null
    }
  | {
      /**
       * robots.txt, read before the page, and again for the site a redirect led to (M2.4 plan
       * §2). Where it asks the bot not to check the page, the scan ends there.
       */
      readonly step: 'robots'
      readonly outcome: 'fetched' | 'unavailable' | 'unreachable' | 'failed'
      readonly status: number | null
    }
  | {
      /** skipped: no key, or a private address, so CrUX was not asked. */
      readonly step: 'crux'
      readonly outcome: 'found' | 'not-found' | 'failed' | 'skipped'
    }
  | { readonly step: 'render-start'; readonly engine: Engine }
  | { readonly step: 'render'; readonly run: RenderRun }
  | { readonly step: 'lab-start' }
  | { readonly step: 'lab'; readonly status: LabStatus }
  | { readonly step: 'rules'; readonly rules: number }

export type ProgressListener = (progress: ScanProgress) => unknown

/**
 * Calls the listener with each step. What it does is its own affair: it cannot throw into the
 * scan, and a promise it returns is not waited for.
 */
export function progressEmitter(listener: ProgressListener | undefined) {
  return (progress: ScanProgress): void => {
    if (listener === undefined) return
    try {
      const result = listener(progress)
      if (result instanceof Promise) result.catch(() => undefined)
    } catch {
      // A listener cannot break a scan.
    }
  }
}
