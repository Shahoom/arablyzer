import { existsSync, readdirSync, readFileSync } from 'node:fs'
import type { Report } from '@arablyzer/report-schema'
import { RULES } from '@arablyzer/rules'
import { describe, expect, it } from 'vitest'
import { GOLDEN_NAMES, portOf, REPORTS } from './golden/golden'

const reports = GOLDEN_NAMES.filter((name) => existsSync(`${REPORTS}${name}.json`)).map(
  (name) => JSON.parse(readFileSync(`${REPORTS}${name}.json`, 'utf8')) as Report,
)

/** Rules a whole scan never runs: a tool's scan asks the site's search. */
const NOT_IN_A_SCAN = RULES.filter((rule) => rule.needs.includes('search')).length

/** The rules each report gave this status. */
function withStatus(...statuses: string[]): Set<string> {
  return new Set(
    reports.flatMap((report) =>
      report.rules.filter((rule) => statuses.includes(rule.status)).map((rule) => rule.id),
    ),
  )
}

// M1.3 plan §5: local pages that between them fail every rule, twenty then, two more for the
// redirect rules (M2.3a), and seven for M2.3c: three for the sitemap and challenge rules (from 23)
// and four for DNS, links, the rendered text and payments (from 31), and two for the
// Arabic-native rules (from 35: one that fails them, one that passes the riyal sign's). The reports come from the
// scanner image (test/golden); this reads the committed ones, so a new rule needs a page too.
describe('golden reports', () => {
  it('are thirty-one, one for each page, and none for a page that is gone', () => {
    expect(GOLDEN_NAMES).toHaveLength(31)
    expect(reports).toHaveLength(GOLDEN_NAMES.length)
    expect(readdirSync(REPORTS).filter((file) => file.endsWith('.json'))).toHaveLength(31)
  })

  it('have pages numbered once each, which gives each its port', () => {
    const ports = GOLDEN_NAMES.map(portOf)
    expect(new Set(ports).size).toBe(ports.length)
  })

  it('between them fail every rule, or ask for a review where a rule only asks', () => {
    const shown = withStatus('fail', 'needs-review')
    // The rules of a tool's scan alone (the site's search) are not in a whole scan's report.
    expect(
      RULES.filter((rule) => !rule.needs.includes('search'))
        .map((rule) => rule.id)
        .filter((id) => !shown.has(id)),
    ).toEqual([])
  })

  // A rule that fails where it should not shows on a page that is right: each is right somewhere.
  it('between them pass every rule that does not only ask for a review', () => {
    const passed = withStatus('pass')
    const unpassed = RULES.filter(
      (rule) => rule.manualCheck !== true && !rule.needs.includes('search') && !passed.has(rule.id),
    )
    expect(unpassed.map((rule) => rule.id)).toEqual([])
  })

  it('include a page, rendered, that passes everything it can', () => {
    // A bot challenge is rendered in no engine, and its scan has no score: it is never this page.
    const clean = reports.filter(
      (report) =>
        report.score.overall === 100 &&
        report.score.rules.ran === report.score.rules.total - NOT_IN_A_SCAN &&
        (report.scan.render ?? []).length > 0 &&
        report.scan.render?.every((run) => run.status === 'rendered') === true,
    )
    expect(clean).not.toEqual([])
  })
})
