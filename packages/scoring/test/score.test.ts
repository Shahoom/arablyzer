import type { Category, RuleResult, RuleStatus, Severity } from '@arablyzer/report-schema'
import { describe, expect, it } from 'vitest'
import { scoreOf, SEVERITY_WEIGHTS } from '../src/index'

let next = 0
function result(severity: Severity, status: RuleStatus, category: Category = 'onpage'): RuleResult {
  next++
  return {
    id: `rule-${next}`,
    version: '1.0.0',
    category,
    severity,
    status,
    title: { ar: 'قاعدة', en: 'Rule' },
  }
}

describe('scoreOf', () => {
  it('weighs severities 10, 5, 3, 1 and 0', () => {
    expect(SEVERITY_WEIGHTS).toEqual({ critical: 10, serious: 5, moderate: 3, minor: 1, info: 0 })
  })

  // The worked examples of docs/methodology.md, one for each weight.
  it.each([
    // 100 × (1 − 10 ÷ 25)
    ['critical', 60],
    // 100 × (1 − 5 ÷ 20)
    ['serious', 75],
    // 100 × (1 − 3 ÷ 18) = 83.3
    ['moderate', 83],
    // 100 × (1 − 1 ÷ 16) = 93.75
    ['minor', 94],
    // 100 × (1 − 0 ÷ 15)
    ['info', 100],
  ] as const)('a failed %s rule beside passing critical and serious ones', (severity, score) => {
    // Applicable weight: 10 + 5 + the failed rule's own; failed weight: its own.
    const results = [
      result('critical', 'pass'),
      result('serious', 'pass'),
      result(severity, 'fail'),
    ]
    expect(scoreOf(results, results.length).overall).toBe(score)
  })

  it('rounds a half up, where 100 × (1 − 17 ÷ 40) in floating point is 57.49999… (M1.3a review)', () => {
    // Failed: 10 + 5 + 1 + 1 = 17 of 40.
    const results = [
      result('critical', 'fail'),
      result('serious', 'fail'),
      result('minor', 'fail'),
      result('minor', 'fail'),
      result('critical', 'pass'),
      result('serious', 'pass'),
      result('serious', 'pass'),
      result('moderate', 'pass'),
    ]
    expect(scoreOf(results, results.length).overall).toBe(58)
  })

  it('counts only rules that passed or failed', () => {
    const results = [
      result('critical', 'fail'),
      result('critical', 'pass'),
      result('critical', 'not-applicable'),
      result('critical', 'needs-review'),
    ]
    expect(scoreOf(results, 4)).toEqual({
      overall: 50,
      categories: { onpage: 50 },
      partial: false,
      rules: { ran: 4, total: 4 },
    })
  })

  it('scores each category, and gives none to a category of information alone', () => {
    const results = [
      result('serious', 'fail', 'trust'),
      result('moderate', 'pass', 'trust'),
      result('info', 'fail', 'rtl'),
      result('minor', 'pass', 'speed'),
    ]
    expect(scoreOf(results, 4)).toEqual({
      // Applicable 5 + 3 + 0 + 1 = 9; failed 5 + 0 = 5.
      overall: 44,
      categories: { rtl: null, speed: 100, trust: 38 },
      partial: false,
      rules: { ran: 4, total: 4 },
    })
  })

  it('is partial when a rule could not run, and null with nothing that applied', () => {
    expect(scoreOf([result('critical', 'error'), result('minor', 'pass')], 2)).toEqual({
      overall: 100,
      categories: { onpage: 100 },
      partial: true,
      rules: { ran: 2, total: 2 },
    })
    expect(scoreOf([result('critical', 'not-applicable')], 1)).toEqual({
      overall: null,
      categories: { onpage: null },
      partial: false,
      rules: { ran: 1, total: 1 },
    })
  })

  it('gives every category it ran rules of, null when none applied, and says how many ran (M1.3a review)', () => {
    // A category whose rules did not apply is there, as null, as is one of information alone;
    // a category the scan ran no rule of is not. The rule set has more rules than the scan ran.
    const results = [
      result('serious', 'pass', 'trust'),
      result('moderate', 'not-applicable', 'speed'),
      result('info', 'pass', 'rtl'),
    ]
    expect(scoreOf(results, 47)).toEqual({
      overall: 100,
      categories: { rtl: null, speed: null, trust: 100 },
      partial: false,
      rules: { ran: 3, total: 47 },
    })
  })
})
