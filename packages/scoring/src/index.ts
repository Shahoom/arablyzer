import type { Category, RuleResult, Score, Severity } from '@arablyzer/report-schema'

/** Phase 1 design §4, decision 5: what a failed rule of each severity costs. */
export const SEVERITY_WEIGHTS: Readonly<Record<Severity, number>> = Object.freeze({
  critical: 10,
  serious: 5,
  moderate: 3,
  minor: 1,
  info: 0,
})

/**
 * The score of a scan's rule results (docs/methodology.md): 100 × (1 − failed weight ÷
 * applicable weight), rounded to a whole number, overall and for each category. Applicable rules
 * are those that passed or failed: one that did not apply, needs a person's review, or could not
 * run counts for nothing, and a rule that could not run makes the score partial. Without any
 * applicable weight, a score is null: information alone, or nothing that applied.
 */
export function scoreOf(results: readonly RuleResult[]): Score {
  const overall = { applicable: 0, failed: 0 }
  const byCategory = new Map<Category, { applicable: number; failed: number }>()
  let partial = false
  for (const result of results) {
    if (result.status === 'error') partial = true
    if (result.status !== 'pass' && result.status !== 'fail') continue
    const weight = SEVERITY_WEIGHTS[result.severity]
    const category = byCategory.get(result.category) ?? { applicable: 0, failed: 0 }
    byCategory.set(result.category, category)
    for (const tally of [overall, category]) {
      tally.applicable += weight
      if (result.status === 'fail') tally.failed += weight
    }
  }
  const categories: Partial<Record<Category, number | null>> = {}
  for (const [category, tally] of [...byCategory].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    categories[category] = scoreFrom(tally)
  }
  return { overall: scoreFrom(overall), categories, partial }
}

function scoreFrom({ applicable, failed }: { applicable: number; failed: number }): number | null {
  return applicable === 0 ? null : Math.round(100 * (1 - failed / applicable))
}
