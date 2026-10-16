import type { Aggregates } from './aggregate'
import { wilson, type Interval } from './stats'

// What the page and the explorer read of an edition. No imports but the interval maths, so a page's
// script can bundle it.

export interface Selection {
  readonly country: string | null
  readonly platform: string | null
}

export interface Estimate {
  /** Sites judged for the metric in the selection. */
  readonly n: number
  /** Each category's share of them. */
  readonly shares: readonly number[]
  /** For a binary metric: the share with the property, and its 95% interval. */
  readonly yes: Interval | null
  /** Whether the figure is the whole frame's, weighted by country, or a plain share of the sample. */
  readonly weighted: boolean
}

export function selectionKey({ country, platform }: Selection): string {
  return (
    [country === null ? '' : `c:${country}`, platform === null ? '' : `p:${platform}`]
      .filter((part) => part !== '')
      .join('|') || 'all'
  )
}

/**
 * A metric for a selection of the sample, or null when it has fewer sites than the edition's
 * smallest cell (so that no number points at a few sites) or the metric was not measured.
 */
export function estimate(
  edition: Pick<Aggregates, 'cells' | 'overall' | 'metrics' | 'minCell'>,
  selection: Selection,
  metricId: string,
): Estimate | null {
  const metric = edition.metrics.find((m) => m.id === metricId)
  if (metric === undefined) return null
  const binary = metric.categories.length === 2 && metric.categories[0] === 'yes'
  if (selection.country === null && selection.platform === null) {
    const whole = edition.overall[metricId]
    if (whole === null || whole === undefined || whole.n < edition.minCell) return null
    return { n: whole.n, shares: whole.shares, yes: whole.yes, weighted: true }
  }
  const counts = edition.cells[selectionKey(selection)]?.m[metricId]
  const n = counts?.reduce((sum, c) => sum + c, 0) ?? 0
  if (counts === undefined || n < edition.minCell) return null
  return {
    n,
    shares: counts.map((c) => c / n),
    yes: binary ? wilson(counts[0] ?? 0, n) : null,
    weighted: false,
  }
}
