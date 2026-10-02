import { retentionDaysFrom, RETENTION_VARIABLE } from '@arablyzer/plans'
import { quietly, type ScanStore } from '@arablyzer/store'

/** How often the worker looks for scans past their retention. */
export const RETENTION_SWEEP_MS = 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export interface Retention {
  /** Ends the sweep. */
  stop(): void
}

/**
 * Deletes the scans, and their reports, older than the days ARABLYZER_REPORT_RETENTION_DAYS says,
 * when the worker starts and every hour after (M5, issue #33). The number is the owner's and has
 * no default: unset, nothing is deleted by age, and the worker says so once, here, so a
 * deployment that keeps every report says that it does. A value that is not whole days refuses
 * to start. A sweep that fails is told once in a while, and the next one tries again.
 */
export function startRetention(
  env: Readonly<Record<string, string | undefined>>,
  deps: {
    readonly store: ScanStore
    readonly log: (message: string) => void
    readonly now?: () => Date
  },
): Retention {
  const days = retentionDaysFrom(env)
  if (days === null) {
    deps.log(
      `${RETENTION_VARIABLE} is not set: reports and scans are kept, however old, until their owner deletes them.`,
    )
    return { stop: () => undefined }
  }
  deps.log(`Reports and scans older than ${String(days)} days are deleted.`)
  const failed = quietly('Retention', deps.log)
  const sweep = () => {
    const cutoff = new Date((deps.now ?? (() => new Date()))().getTime() - days * DAY_MS)
    // A number of days no scan is that old, past what a date holds.
    if (Number.isNaN(cutoff.getTime())) return
    deps.store
      .deleteOlderThan(cutoff)
      .then((deleted) => {
        if (deleted > 0) {
          deps.log(`Retention: ${String(deleted)} scans older than ${String(days)} days deleted.`)
        }
      })
      .catch((error: unknown) => {
        failed(error instanceof Error ? error : new Error(String(error)))
      })
  }
  sweep()
  const sweeping = setInterval(sweep, RETENTION_SWEEP_MS)
  return {
    stop: () => {
      clearInterval(sweeping)
    },
  }
}
