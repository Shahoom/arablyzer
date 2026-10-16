/** The lowest priority BullMQ takes: a scan with it waits behind every scan with a smaller number or none. */
export const LOWEST_PRIORITY = 2_097_152

export type EngineName = 'chromium' | 'firefox' | 'webkit'
const ENGINES: readonly EngineName[] = ['chromium', 'firefox', 'webkit']

/**
 * How politely the crawl runs (docs/design/plans/m9-state-of-arabic-web.md §3). Each default is the
 * gentle one: a scan at most every twenty seconds, one at a time, in one browser, and only while no
 * visitor's scan is waiting or running and the host is quiet.
 */
export interface RunnerConfig {
  /** Scans of the crawl in the queue or running at once. */
  readonly concurrency: number
  /** The least time between two scans' launches, whatever else is going on (the global rate cap). */
  readonly intervalMs: number
  /** The least time between two reads of a site's front page before its scan (no browser). */
  readonly preflightMs: number
  /** How often a paused crawl looks again. */
  readonly pollMs: number
  /** How often a scan in flight is looked at. */
  readonly watchMs: number
  /** The host's one-minute load per core above which the crawl waits. */
  readonly maxLoad: number
  /** How long a scan may take before its site is failed. */
  readonly scanTimeoutMs: number
  /** Tries for a site whose scan failed, the first included. */
  readonly maxAttempts: number
  readonly engines: readonly EngineName[]
  /** The share of sites (by the seeded hash) that are drawn in all three browsers, 0 to 1. */
  readonly allEnginesShare: number
  readonly seed: string
  readonly priority: number
  /** Stop after this many sites were taken (a trial run); null: the whole frame. */
  readonly limit: number | null
  readonly optOut: ReadonlySet<string>
}

type Env = Readonly<Record<string, string | undefined>>

function number(env: Env, name: string, fallback: number, min: number, max: number): number {
  const text = env[name]?.trim()
  if (text === undefined || text === '') return fallback
  const value = Number(text)
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a number from ${String(min)} to ${String(max)}`)
  }
  return value
}

/** The settings from the environment: every name starts `ARABLYZER_SOTAW_`. */
export function runnerConfigFrom(
  env: Env,
  extras: { readonly seed: string; readonly optOut: ReadonlySet<string> },
): RunnerConfig {
  const asked = env.ARABLYZER_SOTAW_ENGINES?.trim()
  const engines = (asked === undefined || asked === '' ? 'chromium' : asked)
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '')
  for (const name of engines) {
    if (!(ENGINES as readonly string[]).includes(name)) {
      throw new Error('ARABLYZER_SOTAW_ENGINES lists chromium, firefox and webkit, comma separated')
    }
  }
  if (engines.length === 0) throw new Error('ARABLYZER_SOTAW_ENGINES names no engine')
  const limit = env.ARABLYZER_SOTAW_LIMIT?.trim()
  return {
    concurrency: Math.floor(number(env, 'ARABLYZER_SOTAW_CONCURRENCY', 1, 1, 4)),
    intervalMs: number(env, 'ARABLYZER_SOTAW_INTERVAL_SECONDS', 20, 1, 3600) * 1000,
    preflightMs: number(env, 'ARABLYZER_SOTAW_PREFLIGHT_SECONDS', 2, 0, 600) * 1000,
    pollMs: number(env, 'ARABLYZER_SOTAW_POLL_SECONDS', 5, 1, 600) * 1000,
    watchMs: 2000,
    maxLoad: number(env, 'ARABLYZER_SOTAW_MAX_LOAD', 0.5, 0.05, 1),
    scanTimeoutMs: number(env, 'ARABLYZER_SOTAW_SCAN_TIMEOUT_SECONDS', 300, 30, 3600) * 1000,
    maxAttempts: Math.floor(number(env, 'ARABLYZER_SOTAW_MAX_ATTEMPTS', 2, 1, 5)),
    engines: engines as EngineName[],
    allEnginesShare: number(env, 'ARABLYZER_SOTAW_ALL_ENGINES_SHARE', 0, 0, 1),
    seed: extras.seed,
    priority: LOWEST_PRIORITY,
    limit:
      limit === undefined || limit === ''
        ? null
        : Math.floor(number(env, 'ARABLYZER_SOTAW_LIMIT', 1, 1, 1_000_000)),
    optOut: extras.optOut,
  }
}
