import { describe, expect, it } from 'vitest'
import {
  DEVELOPMENT_LIMITS,
  hostLimitFrom,
  limitsFrom,
  retentionDaysFrom,
  RETENTION_VARIABLE,
} from '../src/index'

const ALL = {
  ARABLYZER_LIMIT_CONNECTION_SCANS: '5',
  ARABLYZER_LIMIT_CONNECTION_SECONDS: '600',
  ARABLYZER_LIMIT_NETWORK_SCANS: '40',
  ARABLYZER_LIMIT_NETWORK_SECONDS: '1200',
  ARABLYZER_LIMIT_ATTEMPT_REQUESTS: '25',
  ARABLYZER_LIMIT_ATTEMPT_SECONDS: '300',
  ARABLYZER_LIMIT_HOST_SCANS: '12',
  ARABLYZER_LIMIT_HOST_SECONDS: '3600',
  ARABLYZER_LIMIT_QUEUE: '30',
  ARABLYZER_LIMIT_INFLIGHT: '1',
}

describe('limitsFrom', () => {
  it('keeps the development values outside production', () => {
    expect(limitsFrom({})).toEqual(DEVELOPMENT_LIMITS)
    expect(limitsFrom({ NODE_ENV: 'development', ARABLYZER_LIMIT_QUEUE: '3' }).queue).toBe(3)
  })

  it('keeps the numbers the limits had before the abuse checks', () => {
    expect(DEVELOPMENT_LIMITS.perConnection).toEqual({ scans: 10, seconds: 3600 })
    expect(DEVELOPMENT_LIMITS.perHost).toEqual({ scans: 20, seconds: 3600 })
    expect(DEVELOPMENT_LIMITS.queue).toBe(50)
  })

  it('caps a visitor at one or two scans in flight, in development', () => {
    expect(DEVELOPMENT_LIMITS.inFlight).toBeGreaterThanOrEqual(1)
    expect(DEVELOPMENT_LIMITS.inFlight).toBeLessThanOrEqual(2)
  })

  it('reads every number in production, and refuses to start without one', () => {
    expect(limitsFrom({ NODE_ENV: 'production', ...ALL })).toEqual({
      perConnection: { scans: 5, seconds: 600 },
      perNetwork: { scans: 40, seconds: 1200 },
      attempts: { scans: 25, seconds: 300 },
      perHost: { scans: 12, seconds: 3600 },
      queue: 30,
      inFlight: 1,
    })
    for (const name of Object.keys(ALL)) {
      const missing = Object.fromEntries(Object.entries(ALL).filter(([key]) => key !== name))
      expect(() => limitsFrom({ NODE_ENV: 'production', ...missing }), name).toThrow(
        new RegExp(`${name} must be set in production`),
      )
    }
  })

  it('takes whole numbers of at least 1 only', () => {
    for (const name of Object.keys(ALL)) {
      for (const bad of ['0', '-1', '1.5', 'ten', '1e3', '99999999999999999999']) {
        expect(() => limitsFrom({ [name]: bad }), `${name}=${bad}`).toThrow(/whole number/)
      }
    }
  })

  it('freezes what it gives, so no request can change a limit', () => {
    const limits = limitsFrom({})
    expect(Object.isFrozen(limits)).toBe(true)
    expect(Object.isFrozen(limits.perNetwork)).toBe(true)
    expect(Object.isFrozen(limits.attempts)).toBe(true)
  })
})

describe('hostLimitFrom', () => {
  it('is the limits’ own per-host window, and needs nothing of the others', () => {
    expect(hostLimitFrom({})).toEqual(DEVELOPMENT_LIMITS.perHost)
    const env = { ARABLYZER_LIMIT_HOST_SCANS: '12', ARABLYZER_LIMIT_HOST_SECONDS: '900' }
    expect(hostLimitFrom({ NODE_ENV: 'production', ...env })).toEqual({ scans: 12, seconds: 900 })
    expect(hostLimitFrom(env)).toEqual(limitsFrom(env).perHost)
  })

  it('refuses to start in production without either number, and takes whole numbers only', () => {
    expect(() => hostLimitFrom({ NODE_ENV: 'production' })).toThrow(
      /ARABLYZER_LIMIT_HOST_SCANS must be set in production/,
    )
    expect(() =>
      hostLimitFrom({ NODE_ENV: 'production', ARABLYZER_LIMIT_HOST_SCANS: '5' }),
    ).toThrow(/ARABLYZER_LIMIT_HOST_SECONDS must be set in production/)
    expect(() => hostLimitFrom({ ARABLYZER_LIMIT_HOST_SECONDS: '0' })).toThrow(/whole number/)
  })
})

describe('retentionDaysFrom', () => {
  it('has no number of its own: unset, empty and blank all mean reports are kept', () => {
    expect(RETENTION_VARIABLE).toBe('ARABLYZER_REPORT_RETENTION_DAYS')
    expect(retentionDaysFrom({})).toBeNull()
    expect(retentionDaysFrom({ ARABLYZER_REPORT_RETENTION_DAYS: '' })).toBeNull()
    expect(retentionDaysFrom({ ARABLYZER_REPORT_RETENTION_DAYS: '   ' })).toBeNull()
    // Not even production has one: the owner's number, and never a default.
    expect(retentionDaysFrom({ NODE_ENV: 'production' })).toBeNull()
  })

  it('reads the owner’s number of days', () => {
    expect(retentionDaysFrom({ ARABLYZER_REPORT_RETENTION_DAYS: '90' })).toBe(90)
    expect(retentionDaysFrom({ ARABLYZER_REPORT_RETENTION_DAYS: ' 1 ' })).toBe(1)
  })

  it('takes whole numbers of at least 1 only, and refuses to start on any other', () => {
    for (const bad of ['0', '-1', '1.5', 'ten', '1e3', '99999999999999999999', '30 days']) {
      expect(() => retentionDaysFrom({ ARABLYZER_REPORT_RETENTION_DAYS: bad }), bad).toThrow(
        /ARABLYZER_REPORT_RETENTION_DAYS must be a whole number of days, at least 1/,
      )
    }
  })
})
