import { existsSync, readFileSync } from 'node:fs'
import type { Report } from '@arablyzer/report-schema'
import { RULES } from '@arablyzer/rules'
import { describe, expect, it } from 'vitest'
import { GOLDEN_NAMES, REPORTS } from './golden/golden'

const reports = GOLDEN_NAMES.filter((name) => existsSync(`${REPORTS}${name}.json`)).map(
  (name) => JSON.parse(readFileSync(`${REPORTS}${name}.json`, 'utf8')) as Report,
)

// M1.3 plan §5: twenty local pages that between them fail every rule. The reports come from the
// scanner image (test/golden); this reads the committed ones, so a new rule needs a page too.
describe('golden reports', () => {
  it('are twenty, one for each page', () => {
    expect(GOLDEN_NAMES).toHaveLength(20)
    expect(reports).toHaveLength(GOLDEN_NAMES.length)
  })

  it('between them fail every rule, or ask for a review where a rule only asks', () => {
    const shown = new Set(
      reports.flatMap((report) =>
        report.rules
          .filter((rule) => rule.status === 'fail' || rule.status === 'needs-review')
          .map((rule) => rule.id),
      ),
    )
    expect(RULES.map((rule) => rule.id).filter((id) => !shown.has(id))).toEqual([])
  })

  it('include a page that passes everything it can', () => {
    expect(reports.some((report) => report.score.overall === 100)).toBe(true)
  })
})
