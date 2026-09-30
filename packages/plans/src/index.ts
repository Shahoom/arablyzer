/**
 * Plans and quotas (BUILD-PLAN §3): one source for the site and the API, enforced in the API.
 * Phase 2 has one plan, the anonymous free scan; its numbers are the owner's decision (Phase 2
 * design §7.2).
 */

export interface Window {
  /** Scans allowed in the window (for `attempts`, requests). */
  readonly scans: number
  readonly seconds: number
}

export interface ScanLimits {
  /**
   * One visitor's scans: a token bucket that refills evenly over the window. A visitor is an IPv4
   * address, or an IPv6 address's /48 (apps/api client.ts).
   */
  readonly perConnection: Window
  /**
   * The scans of one IPv6 network together, its /32, which holds 65,536 /48s: a provider's
   * allocation cannot multiply a visitor's limit by spreading over them. A bucket like the
   * visitor's, and larger.
   */
  readonly perNetwork: Window
  /**
   * The requests one visitor makes to start a scan, whatever comes of them, counted before
   * Turnstile is asked: a request past it is refused without a call to Cloudflare. It has room
   * for the requests that fail, so it is larger than `perConnection`.
   */
  readonly attempts: Window
  /** Scans of one host by everyone together, so no site is flooded through Arablyzer. */
  readonly perHost: Window
  /** Scans waiting in the queue; past it, new ones are refused as unavailable. */
  readonly queue: number
  /** The scans one visitor has queued or running at once; past it, a new one is refused. */
  readonly inFlight: number
}

/**
 * For development and tests only, until the owner sets the real numbers. Production never falls
 * back to these: limitsFrom() refuses to start without its own.
 */
export const DEVELOPMENT_LIMITS: ScanLimits = Object.freeze({
  perConnection: Object.freeze({ scans: 10, seconds: 3600 }),
  perNetwork: Object.freeze({ scans: 100, seconds: 3600 }),
  attempts: Object.freeze({ scans: 60, seconds: 3600 }),
  perHost: Object.freeze({ scans: 20, seconds: 3600 }),
  queue: 50,
  inFlight: 2,
})

const VARIABLES = {
  connectionScans: 'ARABLYZER_LIMIT_CONNECTION_SCANS',
  connectionSeconds: 'ARABLYZER_LIMIT_CONNECTION_SECONDS',
  networkScans: 'ARABLYZER_LIMIT_NETWORK_SCANS',
  networkSeconds: 'ARABLYZER_LIMIT_NETWORK_SECONDS',
  attemptRequests: 'ARABLYZER_LIMIT_ATTEMPT_REQUESTS',
  attemptSeconds: 'ARABLYZER_LIMIT_ATTEMPT_SECONDS',
  hostScans: 'ARABLYZER_LIMIT_HOST_SCANS',
  hostSeconds: 'ARABLYZER_LIMIT_HOST_SECONDS',
  queue: 'ARABLYZER_LIMIT_QUEUE',
  inFlight: 'ARABLYZER_LIMIT_INFLIGHT',
} as const

type Env = Readonly<Record<string, string | undefined>>

/**
 * A reader of the limits' numbers: a whole number of at least 1 from the variable, the
 * development value where it is not set outside production, and a refusal to start where it is
 * not set in production.
 */
function reader(env: Env): (name: string, fallback: number) => number {
  const production = env.NODE_ENV === 'production'
  return (name, fallback) => {
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
}

/**
 * The per-host limit alone, for the worker, which counts the site a scan ends at and needs none of
 * the others (apps/worker). The same numbers as `limitsFrom(env).perHost`.
 */
export function hostLimitFrom(env: Env): Window {
  const read = reader(env)
  const d = DEVELOPMENT_LIMITS
  return Object.freeze({
    scans: read(VARIABLES.hostScans, d.perHost.scans),
    seconds: read(VARIABLES.hostSeconds, d.perHost.seconds),
  })
}

/**
 * The limits from the environment. In production every variable must be set; elsewhere, those
 * not set keep their development values.
 */
export function limitsFrom(env: Env): ScanLimits {
  const read = reader(env)
  const d = DEVELOPMENT_LIMITS
  return Object.freeze({
    perConnection: Object.freeze({
      scans: read(VARIABLES.connectionScans, d.perConnection.scans),
      seconds: read(VARIABLES.connectionSeconds, d.perConnection.seconds),
    }),
    perNetwork: Object.freeze({
      scans: read(VARIABLES.networkScans, d.perNetwork.scans),
      seconds: read(VARIABLES.networkSeconds, d.perNetwork.seconds),
    }),
    attempts: Object.freeze({
      scans: read(VARIABLES.attemptRequests, d.attempts.scans),
      seconds: read(VARIABLES.attemptSeconds, d.attempts.seconds),
    }),
    perHost: hostLimitFrom(env),
    queue: read(VARIABLES.queue, d.queue),
    inFlight: read(VARIABLES.inFlight, d.inFlight),
  })
}
