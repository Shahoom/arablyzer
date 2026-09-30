import { describe, expect, it } from 'vitest'
import { DEVELOPMENT_LIMITS, limitsFrom } from '../src/index'

const ALL = {
  ARABLYZER_LIMIT_CONNECTION_SCANS: '5',
  ARABLYZER_LIMIT_CONNECTION_SECONDS: '600',
  ARABLYZER_LIMIT_HOST_SCANS: '12',
  ARABLYZER_LIMIT_HOST_SECONDS: '3600',
  ARABLYZER_LIMIT_QUEUE: '30',
}

describe('limitsFrom', () => {
  it('keeps the development values outside production', () => {
    expect(limitsFrom({})).toEqual(DEVELOPMENT_LIMITS)
    expect(limitsFrom({ NODE_ENV: 'development', ARABLYZER_LIMIT_QUEUE: '3' }).queue).toBe(3)
  })

  it('reads every number in production, and refuses to start without one', () => {
    expect(limitsFrom({ NODE_ENV: 'production', ...ALL })).toEqual({
      perConnection: { scans: 5, seconds: 600 },
      perHost: { scans: 12, seconds: 3600 },
      queue: 30,
    })
    const missing = Object.fromEntries(
      Object.entries(ALL).filter(([name]) => name !== 'ARABLYZER_LIMIT_HOST_SCANS'),
    )
    expect(() => limitsFrom({ NODE_ENV: 'production', ...missing })).toThrow(
      /ARABLYZER_LIMIT_HOST_SCANS must be set in production/,
    )
  })

  it('takes whole numbers of at least 1 only', () => {
    for (const bad of ['0', '-1', '1.5', 'ten', '1e3', '99999999999999999999']) {
      expect(() => limitsFrom({ ARABLYZER_LIMIT_QUEUE: bad }), bad).toThrow(/whole number/)
    }
  })
})
