import { describe, expect, it } from 'vitest'
import {
  accountHistoryDaysFrom,
  DEVELOPMENT_ACCOUNT_PLAN,
  DEVELOPMENT_LIMITS,
  planCatalogFrom,
} from '../src/index'

const SET = {
  ARABLYZER_PLAN_ACCOUNT_SCANS: '40',
  ARABLYZER_PLAN_ACCOUNT_SCAN_SECONDS: '3600',
  ARABLYZER_PLAN_ACCOUNT_INFLIGHT: '4',
  ARABLYZER_PLAN_ACCOUNT_SAVED_SITES: '7',
  ARABLYZER_PLAN_ACCOUNT_HISTORY_DAYS: '30',
}

describe('planCatalogFrom', () => {
  it('keeps the development numbers outside production, and no paid plan', () => {
    const catalog = planCatalogFrom({}, DEVELOPMENT_LIMITS)
    expect(catalog.account).toEqual(DEVELOPMENT_ACCOUNT_PLAN)
    expect(catalog.pro).toBeNull()
    expect(catalog.agency).toBeNull()
  })

  it('reads the five numbers', () => {
    const { account } = planCatalogFrom(SET, DEVELOPMENT_LIMITS)
    expect(account).toEqual({
      id: 'account',
      scans: { scans: 40, seconds: 3600 },
      inFlight: 4,
      savedSites: 7,
      historyDays: 30,
    })
  })

  it.each(Object.keys(SET))('refuses to start in production without %s', (missing) => {
    const env = { NODE_ENV: 'production', ...SET, [missing]: undefined }
    expect(() => planCatalogFrom(env, DEVELOPMENT_LIMITS)).toThrow(missing)
  })

  it('refuses a number that is not a whole number of at least 1', () => {
    expect(() =>
      planCatalogFrom({ ...SET, ARABLYZER_PLAN_ACCOUNT_SAVED_SITES: '0' }, DEVELOPMENT_LIMITS),
    ).toThrow(/ARABLYZER_PLAN_ACCOUNT_SAVED_SITES/)
  })

  it('never gives an account less than an anonymous visitor', () => {
    expect(() =>
      planCatalogFrom({ ...SET, ARABLYZER_PLAN_ACCOUNT_SCANS: '2' }, DEVELOPMENT_LIMITS),
    ).toThrow(/fewer than an anonymous/)
    expect(() =>
      planCatalogFrom({ ...SET, ARABLYZER_PLAN_ACCOUNT_INFLIGHT: '1' }, DEVELOPMENT_LIMITS),
    ).toThrow(/concurrent scans are fewer/)
  })

  it('takes a paid plan with all five numbers or none', () => {
    const pro = Object.fromEntries(
      Object.keys(SET).map((key) => [key.replace('ACCOUNT', 'PRO'), SET[key as keyof typeof SET]]),
    )
    expect(planCatalogFrom({ ...SET, ...pro }, DEVELOPMENT_LIMITS).pro?.id).toBe('pro')
    expect(() =>
      planCatalogFrom({ ...SET, ARABLYZER_PLAN_PRO_SCANS: '9' }, DEVELOPMENT_LIMITS),
    ).toThrow(/pro needs all of/)
  })
})

describe('accountHistoryDaysFrom', () => {
  it('is null with accounts off, and the plan days with them on', () => {
    expect(accountHistoryDaysFrom({ ...SET })).toBeNull()
    expect(accountHistoryDaysFrom({ ...SET, ARABLYZER_ACCOUNTS: 'on' })).toBe(30)
    expect(() =>
      accountHistoryDaysFrom({ NODE_ENV: 'production', ARABLYZER_ACCOUNTS: 'on' }),
    ).toThrow(/HISTORY_DAYS/)
  })
})
