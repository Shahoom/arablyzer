/**
 * Plans and quotas (BUILD-PLAN §3): one source for the site and the API, enforced in the API.
 * Phase 2 has one plan, the anonymous free scan; its numbers are the owner's decision (Phase 2
 * design §7.2).
 */

export interface Window {
  /** Scans allowed in the window. */
  readonly scans: number
  readonly seconds: number
}

export interface ScanLimits {
  /** One connection's scans: a token bucket that refills evenly over the window. */
  readonly perConnection: Window
  /** Scans of one host by everyone together, so no site is flooded through Arablyzer. */
  readonly perHost: Window
  /** Scans waiting in the queue; past it, new ones are refused as unavailable. */
  readonly queue: number
}

/**
 * For development and tests only, until the owner sets the real numbers. Production never falls
 * back to these: limitsFrom() refuses to start without its own.
 */
export const DEVELOPMENT_LIMITS: ScanLimits = Object.freeze({
  perConnection: Object.freeze({ scans: 10, seconds: 3600 }),
  perHost: Object.freeze({ scans: 20, seconds: 3600 }),
  queue: 50,
})

const VARIABLES = {
  connectionScans: 'ARABLYZER_LIMIT_CONNECTION_SCANS',
  connectionSeconds: 'ARABLYZER_LIMIT_CONNECTION_SECONDS',
  hostScans: 'ARABLYZER_LIMIT_HOST_SCANS',
  hostSeconds: 'ARABLYZER_LIMIT_HOST_SECONDS',
  queue: 'ARABLYZER_LIMIT_QUEUE',
} as const

/**
 * The limits from the environment. In production every variable must be set; elsewhere, those
 * not set keep their development values.
 */
export function limitsFrom(env: Readonly<Record<string, string | undefined>>): ScanLimits {
  const production = env.NODE_ENV === 'production'
  const read = (name: string, fallback: number): number => {
    const raw = env[name]?.trim()
    if (raw === undefined || raw === '') {
      if (production) throw new Error(`${name} must be set in production (Phase 2 design §7.2)`)
      return fallback
    }
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || !Number.isSafeInteger(Number(raw))) {
      throw new Error(`${name} must be a whole number of at least 1, not ${raw}`)
    }
    return Number(raw)
  }
  const d = DEVELOPMENT_LIMITS
  return Object.freeze({
    perConnection: Object.freeze({
      scans: read(VARIABLES.connectionScans, d.perConnection.scans),
      seconds: read(VARIABLES.connectionSeconds, d.perConnection.seconds),
    }),
    perHost: Object.freeze({
      scans: read(VARIABLES.hostScans, d.perHost.scans),
      seconds: read(VARIABLES.hostSeconds, d.perHost.seconds),
    }),
    queue: read(VARIABLES.queue, d.queue),
  })
}
