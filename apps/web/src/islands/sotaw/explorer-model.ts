import type { Aggregates } from '@arablyzer/sotaw/aggregate'
import { estimate, type Selection } from '@arablyzer/sotaw/estimate'

// The explorer's arithmetic (M9): what a selection of country, platform and metric shows. Pure, so
// a test can run it without a page; `estimate` is the same function the report's figures use.

export interface ExplorerMetric {
  readonly id: string
  readonly kind: 'problem' | 'adoption' | 'distribution'
  readonly title: string
  readonly group: string
  /** The categories in order, each as the page words it. */
  readonly categories: readonly { readonly key: string; readonly label: string }[]
}

export interface Row {
  readonly key: string
  readonly label: string
  readonly share: number
  readonly count: number
}

export interface View {
  readonly n: number
  readonly rows: readonly Row[]
  /** A binary metric: the share with the property and its 95% interval. */
  readonly yes: { readonly p: number; readonly lo: number; readonly hi: number } | null
  readonly weighted: boolean
}

/** Null when the selection has fewer pages judged than the edition's smallest cell, or none. */
export function viewOf(
  edition: Pick<Aggregates, 'cells' | 'overall' | 'metrics' | 'minCell'>,
  selection: Selection,
  metric: ExplorerMetric,
): View | null {
  const found = estimate(edition, selection, metric.id)
  if (found === null) return null
  const whole = selection.country === null && selection.platform === null
  const counts = whole ? null : edition.cells[cellOf(selection)]?.m[metric.id]
  return {
    n: found.n,
    rows: metric.categories.map((category, index) => ({
      key: category.key,
      label: category.label,
      share: found.shares[index] ?? 0,
      // A whole-sample row is a weighted share: its count is the share of the pages judged.
      count: counts?.[index] ?? Math.round((found.shares[index] ?? 0) * found.n),
    })),
    yes: found.yes,
    weighted: found.weighted,
  }
}

const cellOf = ({ country, platform }: Selection): string =>
  [country === null ? '' : `c:${country}`, platform === null ? '' : `p:${platform}`]
    .filter((part) => part !== '')
    .join('|')

/** Whether what the scanner-free page fetched is an edition: the parts the explorer reads, and no more. */
export function isEdition(value: unknown): value is Aggregates {
  if (typeof value !== 'object' || value === null) return false
  const edition = value as Record<string, unknown>
  return (
    edition.v === 1 &&
    typeof edition.minCell === 'number' &&
    typeof edition.cells === 'object' &&
    edition.cells !== null &&
    typeof edition.overall === 'object' &&
    edition.overall !== null &&
    Array.isArray(edition.metrics)
  )
}
