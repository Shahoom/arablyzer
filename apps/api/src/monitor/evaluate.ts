import type { ScanRecord } from '@arablyzer/store'

/** What a finished monitor scan says, next to the one before it. */
export interface Facts {
  /** The overall score; null when the scan did not reach the page. */
  readonly score: number | null
  readonly previousScore: number | null
  /** The scan failed, or ended without reaching the page: the site could not be checked. */
  readonly unreachable: boolean
  /** Critical findings that are in this scan and were not in the one before. */
  readonly newCritical: number
}

const criticalOf = (scan: ScanRecord | null): Set<string> =>
  new Set(
    scan?.report?.findings
      .filter((finding) => finding.severity === 'critical')
      .map((finding) => finding.fingerprint) ?? [],
  )

/**
 * Reads the two scans, and nothing else: the decision is the scan store's, so it is the same
 * whenever and however many times it is asked. With no earlier scan this one is the baseline: it
 * alerts nothing but a site that cannot be reached.
 */
export function factsOf(current: ScanRecord, previous: ScanRecord | null): Facts {
  const score = current.report?.score.overall ?? null
  const unreachable = current.state === 'failed' || current.report === null || score === null
  const before = criticalOf(previous)
  const now = criticalOf(current)
  return {
    score,
    previousScore: previous?.report?.score.overall ?? null,
    unreachable,
    newCritical: previous === null ? 0 : [...now].filter((print) => !before.has(print)).length,
  }
}

export type AlertEvent =
  | { readonly type: 'score-drop'; readonly from: number; readonly to: number }
  | { readonly type: 'critical'; readonly count: number }
  | { readonly type: 'down' }
  | { readonly type: 'paused' }

/** Failures in a row after which a monitor stops itself rather than scan a dead site for ever. */
export const MAX_FAILURES = 4

export interface Wants {
  readonly dropThreshold: number
  readonly onCritical: boolean
  readonly onDown: boolean
}

/**
 * The events that alert. A site that cannot be reached alerts once (the first failure) and again
 * when monitoring stops itself; the failures between are silent. `consecutive` counts this run.
 */
export function eventsOf(facts: Facts, wants: Wants, consecutive: number): AlertEvent[] {
  const events: AlertEvent[] = []
  if (facts.unreachable) {
    if (wants.onDown && consecutive === 1) events.push({ type: 'down' })
    if (wants.onDown && consecutive === MAX_FAILURES) events.push({ type: 'paused' })
    return events
  }
  if (
    facts.score !== null &&
    facts.previousScore !== null &&
    facts.previousScore - facts.score >= wants.dropThreshold
  ) {
    events.push({ type: 'score-drop', from: facts.previousScore, to: facts.score })
  }
  if (wants.onCritical && facts.newCritical > 0) {
    events.push({ type: 'critical', count: facts.newCritical })
  }
  return events
}
