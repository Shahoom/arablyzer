import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { localePath, PATHS } from '@arablyzer/seo/site'
import Ajv from 'ajv-draft-04'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'
import { categoryOf, LEVELS, toSarif } from '../src/sarif'
import { golden, goldenReports, ORIGIN } from './fixtures'

const schema = JSON.parse(
  readFileSync(fileURLToPath(new URL('./sarif-schema-2.1.0.json', import.meta.url)), 'utf8'),
) as object
// The published schema has a pattern (language tags) that is only valid without the `u` flag.
const ajv = new Ajv({ allErrors: true, strict: false, unicodeRegExp: false })
addFormats(ajv)
const validate = ajv.compile(schema)

const options = (lang: 'ar' | 'en') => ({ origin: ORIGIN, lang, reportUrl: `${ORIGIN}/r/abc` })

describe('SARIF export', () => {
  for (const lang of ['ar', 'en'] as const) {
    it(`is valid SARIF 2.1.0 for every golden report (${lang})`, () => {
      const reports = goldenReports()
      expect(reports.length).toBeGreaterThan(20)
      for (const { name, report } of reports) {
        const log = toSarif(report, options(lang))
        const valid = validate(log)
        expect(valid, `${name}: ${JSON.stringify(validate.errors?.slice(0, 3))}`).toBe(true)
        expect(log.runs[0].results).toHaveLength(report.findings.length)
      }
    })
  }

  it('would catch a wrong log: the validator is not vacuous', () => {
    const log = toSarif(golden('07-'), options('en'))
    expect(validate({ ...log, version: '2.0.0' })).toBe(false)
    const broken = structuredClone(log) as unknown as { runs: { results: { level: string }[] }[] }
    for (const result of broken.runs.flatMap((run) => run.results)) result.level = 'critical'
    expect(validate(broken)).toBe(false)
  })

  it('maps severity to level and links each rule to its page', () => {
    const report = golden('13-')
    const log = toSarif(report, options('en'))
    const [run] = log.runs
    expect(run.results.length).toBeGreaterThan(0)
    for (const result of run.results) {
      expect(result.level).toBe(LEVELS[result.properties.severity])
      const rule = run.tool.driver.rules[result.ruleIndex]
      expect(rule?.id).toBe(result.ruleId)
      expect(rule?.helpUri).toBe(`${ORIGIN}${localePath('en', PATHS.rule(result.ruleId))}`)
    }
    expect(LEVELS).toEqual({
      critical: 'error',
      serious: 'error',
      moderate: 'warning',
      minor: 'note',
      info: 'note',
    })
    // A rule appears once, however many findings it has.
    const ids = run.tool.driver.rules.map((rule) => rule.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('writes the message and the rule title in the language asked for', () => {
    const report = golden('07-')
    const finding = report.findings[0]
    const ar = toSarif(report, options('ar')).runs[0]
    const en = toSarif(report, options('en')).runs[0]
    expect(ar.results[0]?.message.text).toBe(finding?.message.ar)
    expect(en.results[0]?.message.text).toBe(finding?.message.en)
    expect(ar.tool.driver.rules[0]?.helpUri).toBe(`${ORIGIN}${PATHS.rule(finding?.ruleId ?? '')}`)
    expect(en.tool.driver.rules[0]?.helpUri).toContain('/en/rules/')
  })

  it('puts the page’s address and the selector where a file and line would be', () => {
    const report = golden('07-')
    const log = toSarif(report, options('en'))
    const located = report.findings.findIndex((f) => f.evidence.location !== undefined)
    expect(located).toBeGreaterThanOrEqual(0)
    const result = log.runs[0].results[located]
    const finding = report.findings[located]
    const location = result?.locations[0]
    expect(location?.physicalLocation.artifactLocation.uri.startsWith('http')).toBe(true)
    expect(location?.physicalLocation.region?.startLine).toBe(finding?.evidence.location?.line)
    const selector = report.findings.find((f) => f.evidence.selector !== undefined)
    if (selector !== undefined) {
      const at = log.runs[0].results[report.findings.indexOf(selector)]
      expect(at?.locations[0]?.logicalLocations).toEqual([
        { name: selector.evidence.selector, kind: 'element' },
      ])
    }
    expect(result?.partialFingerprints['arablyzer/v1']).toBe(finding?.fingerprint)
  })

  it('gives each page its own category, and records the score', () => {
    expect(categoryOf('https://shop.example/ar/products/?q=1')).toBe(
      'arablyzer/shop.example/ar/products/',
    )
    expect(categoryOf('https://shop.example/')).toBe('arablyzer/shop.example/')
    const report = golden('10-')
    const log = toSarif(report, options('en'))
    expect(log.runs[0].properties.score).toBe(report.score.overall)
    expect(log.runs[0].automationDetails.id).toMatch(/^arablyzer\/[^/]+\/$/)
  })

  it('is valid for a clean page: no findings, no rules', () => {
    const log = toSarif(golden('01-'), options('en'))
    expect(validate(log)).toBe(true)
    expect(log.runs[0].results).toEqual([])
    expect(log.runs[0].tool.driver.rules).toEqual([])
  })
})
