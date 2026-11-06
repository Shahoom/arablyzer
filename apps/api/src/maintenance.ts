import {
  AUDIT_DAYS,
  quietly,
  type AdminData,
  type AiData,
  type AuthMaintenance,
} from '@arablyzer/store'

/** How often the accounts tables are swept. */
export const AUTH_SWEEP_MS = 60 * 60 * 1000
/** How long the fix assistant's ledger is kept (a month's cap needs a month; the rest is for the owner's eye). */
export const AI_LEDGER_DAYS = 90

/**
 * Sweeps the accounts tables at start and every interval, telling a count only when something
 * went. A failing sweep is told once in a while and tried again at the next interval.
 */
export function startAuthMaintenance(
  maintenance: AuthMaintenance,
  log: (message: string) => void,
  options: {
    readonly intervalMs?: number
    readonly now?: () => Date
    /** The owner's audit, kept a year (M4.8): swept with the sessions. */
    readonly admin?: AdminData
    /** The fix assistant's ledger and stored answers (BUILD-PLAN §12), swept with them. */
    readonly ai?: AiData
  } = {},
): { stop(): void } {
  const failure = quietly('Accounts sweep', log)
  const now = options.now ?? (() => new Date())
  const sweep = async (): Promise<void> => {
    try {
      const at = now()
      const audit = await options.admin?.sweepAudit(
        new Date(at.getTime() - AUDIT_DAYS * 86_400_000),
      )
      if (audit !== undefined && audit > 0) log(`Accounts sweep: ${audit} audit entries a year old`)
      const ai = await options.ai?.prune(new Date(at.getTime() - AI_LEDGER_DAYS * 86_400_000))
      if (ai !== undefined && ai > 0)
        log(`Accounts sweep: ${ai} fix assistant rows past their time`)
      const gone = await maintenance.deleteExpired(at)
      if (gone.sessions > 0 || gone.verifications > 0) {
        log(
          `Accounts sweep: ${gone.sessions} expired sessions, ${gone.verifications} sign-in states`,
        )
      }
    } catch (thrown) {
      failure(thrown instanceof Error ? thrown : new Error('The sweep failed'))
    }
  }
  void sweep()
  const timer = setInterval(() => void sweep(), options.intervalMs ?? AUTH_SWEEP_MS)
  timer.unref()
  return {
    stop: () => {
      clearInterval(timer)
    },
  }
}
