import { existsSync, readdirSync, readFileSync } from 'node:fs'
import type { Report } from '@arablyzer/report-schema'
import { RULES } from '@arablyzer/rules'
import { describe, expect, it } from 'vitest'
import { GOLDEN_NAMES, portOf, REPORTS } from './golden/golden'

const reports = GOLDEN_NAMES.filter((name) => existsSync(`${REPORTS}${name}.json`)).map(
  (name) => JSON.parse(readFileSync(`${REPORTS}${name}.json`, 'utf8')) as Report,
)

/** The rules each report gave this status. */
function withStatus(...statuses: string[]): Set<string> {
  return new Set(
    reports.flatMap((report) =>
      report.rules.filter((rule) => statuses.includes(rule.status)).map((rule) => rule.id),
    ),
  )
}

// M1.3 plan §5: local pages that between them fail every rule, twenty then, and two more for the
// redirect rules (M2.3a). The reports come from the scanner image (test/golden); this reads the
// committed ones, so a new rule needs a page too.
describe('golden reports', () => {
  it('are twenty-two, one for each page, and none for a page that is gone', () => {
    expect(GOLDEN_NAMES).toHaveLength(22)
    expect(reports).toHaveLength(GOLDEN_NAMES.length)
    expect(readdirSync(REPORTS).filter((file) => file.endsWith('.json'))).toHaveLength(22)
  })

  it('have pages numbered once each, which gives each its port', () => {
    const ports = GOLDEN_NAMES.map(portOf)
    expect(new Set(ports).size).toBe(ports.length)
  })

  it('between them fail every rule, or ask for a review where a rule only asks', () => {
    const shown = withStatus('fail', 'needs-review')
    expect(RULES.map((rule) => rule.id).filter((id) => !shown.has(id))).toEqual([])
  })

  // A rule that fails where it should not shows on a page that is right: each is right somewhere.
  it('between them pass every rule that does not only ask for a review', () => {
    const passed = withStatus('pass')
    const unpassed = RULES.filter((rule) => rule.manualCheck !== true && !passed.has(rule.id))
    expect(unpassed.map((rule) => rule.id)).toEqual([])
  })

  it('include a page, rendered, that passes everything it can', () => {
    const clean = reports.filter(
      (report) =>
        report.score.overall === 100 &&
        report.score.rules.ran === report.score.rules.total &&
        report.scan.render?.every((run) => run.status === 'rendered') === true,
    )
    expect(clean).not.toEqual([])
  })
})
