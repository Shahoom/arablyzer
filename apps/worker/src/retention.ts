import { accountHistoryDaysFrom, retentionDaysFrom, RETENTION_VARIABLE } from '@arablyzer/plans'
import { quietly, type RetentionScope, type ScanStore } from '@arablyzer/store'

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
 *
 * The scans an account keeps (M4.2) are not that number's: the sweep above leaves them, and with
 * accounts on, a second sweep deletes them after the days their plan keeps a history.
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
  const historyDays = accountHistoryDaysFrom(env)
  const sweeps: (() => void)[] = []
  if (days === null) {
    deps.log(
      `${RETENTION_VARIABLE} is not set: reports and scans are kept, however old, until their owner deletes them.`,
    )
  } else {
    deps.log(`Reports and scans older than ${String(days)} days are deleted.`)
    sweeps.push(sweepOf(days, 'unlinked', deps))
  }
  if (historyDays !== null) {
    deps.log(
      `Scans an account keeps are deleted after ${String(historyDays)} days, its plan's history.`,
    )
    sweeps.push(sweepOf(historyDays, 'linked', deps))
  }
  const sweep = () => {
    for (const run of sweeps) run()
  }
  if (sweeps.length === 0) return { stop: () => undefined }
  sweep()
  const sweeping = setInterval(sweep, RETENTION_SWEEP_MS)
  return {
    stop: () => {
      clearInterval(sweeping)
    },
  }
}

/** One sweep of the scans of a scope older than a number of days. */
function sweepOf(
  days: number,
  scope: RetentionScope,
  deps: {
    readonly store: ScanStore
    readonly log: (message: string) => void
    readonly now?: () => Date
  },
): () => void {
  const failed = quietly('Retention', deps.log)
  return () => {
    const cutoff = new Date((deps.now ?? (() => new Date()))().getTime() - days * DAY_MS)
    // A number of days no scan is that old, past what a date holds.
    if (Number.isNaN(cutoff.getTime())) return
    deps.store
      .deleteOlderThan(cutoff, scope)
      .then((deleted) => {
        if (deleted > 0) {
          const kind = scope === 'linked' ? 'account scans' : 'scans'
          deps.log(`Retention: ${String(deleted)} ${kind} older than ${String(days)} days deleted.`)
        }
      })
      .catch((error: unknown) => {
        failed(error instanceof Error ? error : new Error(String(error)))
      })
  }
}
