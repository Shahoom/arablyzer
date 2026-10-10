import {
  MAX_HISTORY_MARKERS,
  MAX_HISTORY_POINTS,
  type HistoryMarker,
  type HistoryPoint,
  type SiteHistory,
} from '@arablyzer/api-contract'
import type { ScorePoint } from '@arablyzer/store'
import { eventsOf, type Facts, type Wants } from '../monitor/evaluate'

// A saved site's scores over the plan's window, and where monitoring would have alerted. Alerts
// are not stored: a run keeps only that it was delivered. The decision is a pure function of two
// scans and the person's thresholds, so the markers are asked of the same function the scheduler
// asks, with the thresholds the person has now.

const reached = (point: ScorePoint): boolean =>
  (point.state === 'complete' || point.state === 'partial') && point.score !== null

const pointOf = (point: ScorePoint): HistoryPoint => ({
  scanId: point.scanId,
  at: point.createdAt.toISOString(),
  source: point.source === 'monitor' ? 'monitor' : 'manual',
  state: point.state,
  overall: point.score,
  categories: point.categories,
})

export function markersOf(points: readonly ScorePoint[], wants: Wants): HistoryMarker[] {
  const markers: HistoryMarker[] = []
  let previous: ScorePoint | null = null
  let failures = 0
  for (const point of points) {
    if (point.source === 'monitor') {
      const unreachable = !reached(point)
      failures = unreachable ? failures + 1 : 0
      // The first point of the window has no earlier scan to be read against, as a monitor's
      // first scan has none: it can only say the site was down.
      const facts: Facts = {
        score: point.score,
        previousScore: previous?.score ?? null,
        unreachable,
        newCritical:
          previous === null
            ? 0
            : point.criticals.filter((print) => !previous?.criticals.includes(print)).length,
      }
      for (const event of eventsOf(facts, wants, failures)) {
        const at = point.createdAt.toISOString()
        if (event.type === 'score-drop') {
          markers.push({
            scanId: point.scanId,
            at,
            kind: 'score-drop',
            from: event.from,
            to: event.to,
          })
        } else if (event.type === 'critical') {
          markers.push({ scanId: point.scanId, at, kind: 'critical', count: event.count })
        } else if (event.type === 'down') {
          markers.push({ scanId: point.scanId, at, kind: 'down' })
        }
      }
    }
    if (reached(point)) previous = point
  }
  return markers.slice(-MAX_HISTORY_MARKERS)
}

export function siteHistory(input: {
  readonly siteId: string
  readonly url: string
  readonly days: number
  readonly since: Date
  readonly points: readonly ScorePoint[]
  /** The person's alert settings; null when this deployment has no monitoring. */
  readonly wants: Wants | null
}): SiteHistory {
  const points = input.points.slice(-MAX_HISTORY_POINTS)
  return {
    siteId: input.siteId,
    url: input.url,
    days: input.days,
    since: input.since.toISOString(),
    points: points.map(pointOf),
    markers: input.wants === null ? [] : markersOf(points, input.wants),
    alerts: input.wants !== null,
  }
}
