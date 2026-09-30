import { describe, expect, it } from 'vitest'
import { DEVELOPMENT_LIMITS, limitsFrom } from '../src/index'

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
