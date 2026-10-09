import type { MonitorPoint, MonitorSummary } from '@arablyzer/api-contract'
import type { Monitor, RunPoint } from '@arablyzer/store'

export const MINUTE_MS = 60_000
export const DAY_MS = 24 * 60 * MINUTE_MS

/** A random number in [0, 1): tests pass their own. */
export type Random = () => number

/**
 * When a monitor just turned on first runs: soon, but spread over a few minutes, so people who
 * enable monitoring together (a plan change, a launch) do not queue together.
 */
export function firstRunAt(now: Date, random: Random = Math.random): Date {
  return new Date(now.getTime() + Math.floor(random() * 5 * MINUTE_MS) + MINUTE_MS)
}

/**
 * The date after a run: the interval from when it started, give or take half an hour, so monitors
 * made on the same day drift apart instead of staying in step.
 */
export function nextRunAfter(now: Date, everyDays: number, random: Random = Math.random): Date {
  const jitter = Math.floor((random() - 0.5) * 60 * MINUTE_MS)
  return new Date(now.getTime() + everyDays * DAY_MS + jitter)
}

export const pointOf = (point: RunPoint): MonitorPoint => ({
  scanId: point.scanId,
  state: point.state,
  score: point.score,
  at: point.at.toISOString(),
})

export function monitorSummary(monitor: Monitor, trend: readonly RunPoint[]): MonitorSummary {
  return {
    everyDays: monitor.everyDays,
    paused: monitor.paused,
    nextRunAt: monitor.nextRunAt.toISOString(),
    failures: monitor.failures,
    trend: trend.map(pointOf),
  }
}
