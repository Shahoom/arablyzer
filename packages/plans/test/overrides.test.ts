import { describe, expect, it } from 'vitest'
import {
  applyOverrides,
  DEVELOPMENT_ACCOUNT_PLAN,
  isOverrideNumber,
  sanitizeOverrides,
} from '../src/index'

describe('plan overrides (M4.8)', () => {
  it('leaves the plan alone when there is nothing to override', () => {
    expect(applyOverrides(DEVELOPMENT_ACCOUNT_PLAN, {})).toBe(DEVELOPMENT_ACCOUNT_PLAN)
  })

  it('puts the owner’s numbers over the plan, and the rest stays', () => {
    const plan = applyOverrides(DEVELOPMENT_ACCOUNT_PLAN, {
      scansPerDay: 500,
      savedSites: 40,
      monitoredSites: 9,
      crawlPages: 300,
      pdfPerMonth: 0,
      whiteLabel: true,
    })
    expect(plan.scans).toEqual({ scans: 500, seconds: 86_400 })
    expect(plan).toMatchObject({
      savedSites: 40,
      monitoredSites: 9,
      crawlPages: 300,
      pdfPerMonth: 0,
      whiteLabel: true,
      inFlight: DEVELOPMENT_ACCOUNT_PLAN.inFlight,
      historyDays: DEVELOPMENT_ACCOUNT_PLAN.historyDays,
      apiKeys: DEVELOPMENT_ACCOUNT_PLAN.apiKeys,
    })
    expect(Object.isFrozen(plan)).toBe(true)
    expect(DEVELOPMENT_ACCOUNT_PLAN.savedSites).toBe(5)
  })

  it('keeps only what is valid in a stored value, and never throws', () => {
    expect(
      sanitizeOverrides({
        scansPerDay: 0,
        savedSites: 1.5,
        monitoredSites: '3',
        crawlPages: 100_001,
        pdfPerMonth: 4,
        whiteLabel: 'yes',
        extra: 1,
      }),
    ).toEqual({ pdfPerMonth: 4 })
    expect(sanitizeOverrides({ scansPerDay: 1, whiteLabel: false })).toEqual({
      scansPerDay: 1,
      whiteLabel: false,
    })
    for (const odd of [null, undefined, 3, 'x', [], [1]]) expect(sanitizeOverrides(odd)).toEqual({})
  })

  it('bounds each number', () => {
    expect(isOverrideNumber('scansPerDay', 0)).toBe(false)
    expect(isOverrideNumber('scansPerDay', 1)).toBe(true)
    expect(isOverrideNumber('savedSites', 0)).toBe(true)
    expect(isOverrideNumber('savedSites', -1)).toBe(false)
    expect(isOverrideNumber('savedSites', 10_001)).toBe(false)
    expect(isOverrideNumber('pdfPerMonth', Number.NaN)).toBe(false)
  })
})
