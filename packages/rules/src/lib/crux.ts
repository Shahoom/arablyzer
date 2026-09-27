import type { CruxFacts } from '@arablyzer/collectors'
import type { DetectorFinding } from '../rule'

/**
 * Google's limits for a "poor" 75th percentile of each Core Web Vital (web.dev, "Web Vitals"):
 * Largest Contentful Paint over 4 s, Interaction to Next Paint over 500 ms, Cumulative Layout
 * Shift over 0.25.
 */
export const POOR = { lcp: 4_000, inp: 500, cls: 0.25 } as const

export type Vital = keyof typeof POOR

/** Whether CrUX has the vital for the page or its origin. */
export function hasVital(crux: CruxFacts | undefined, vital: Vital): boolean {
  return crux?.outcome === 'found' && crux[vital] !== null
}

/**
 * A finding when the vital's 75th percentile is poor. Its message says whose data it is: the
 * page's, or its whole site's when CrUX has none for the page alone. `shown` gives values in the
 * unit the message uses.
 */
export function poorVital(
  crux: CruxFacts | undefined,
  vital: Vital,
  shown: (value: number) => number,
): DetectorFinding<'url' | 'origin'>[] {
  const value = crux?.[vital] ?? null
  if (crux?.scope == null || value === null || value <= POOR[vital]) return []
  return [
    {
      message: crux.scope,
      values: {
        value: shown(value),
        limit: shown(POOR[vital]),
        first: crux.period?.first ?? '',
        last: crux.period?.last ?? '',
      },
      key: crux.scope,
    },
  ]
}
