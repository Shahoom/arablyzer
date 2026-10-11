import type { Report } from '@arablyzer/report-schema'
import { describe, expect, it } from 'vitest'
import { countAtOrAbove, groupIssues, scoreBand } from '../src/issues'

const finding = (ruleId: string, severity: string, evidence: object = {}) => ({
  ruleId,
  severity,
  fingerprint: '0123456789abcdef',
  message: { ar: `عربي ${ruleId}`, en: `English ${ruleId}` },
  evidence,
})
const report = {
  findings: [
    finding('meta-description', 'moderate', { selector: 'head' }),
    finding('rtl-direction', 'critical', { selector: 'html', url: 'https://example.com/a' }),
    finding('img-alt', 'serious', { selector: 'img.a' }),
    finding('img-alt', 'serious', { selector: 'img.b' }),
    finding('lang', 'moderate'),
    finding('notes', 'info'),
  ],
} as unknown as Report

describe('issues', () => {
  it('groups findings by rule, worst first, then most often', () => {
    const issues = groupIssues(report)
    expect(issues.map((i) => [i.ruleId, i.occurrences])).toEqual([
      ['rtl-direction', 1],
      ['img-alt', 2],
      ['lang', 1],
      ['meta-description', 1],
      ['notes', 1],
    ])
    expect(issues[1]?.example).toEqual({ selector: 'img.a' })
    expect(issues[2]?.example).toBeUndefined()
  })

  it('counts what --fail-on counts: that severity and the worse ones', () => {
    const by = { critical: 1, serious: 2, moderate: 3, minor: 4, info: 5 }
    expect(countAtOrAbove(by, 'none')).toBe(0)
    expect(countAtOrAbove(by, 'critical')).toBe(1)
    expect(countAtOrAbove(by, 'serious')).toBe(3)
  })

  it('bands the score as the report page does', () => {
    expect([100, 90, 89, 50, 49, 0].map(scoreBand)).toEqual([
      'good',
      'good',
      'mid',
      'mid',
      'low',
      'low',
    ])
  })
})
