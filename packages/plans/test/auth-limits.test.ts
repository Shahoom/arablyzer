import { describe, expect, it } from 'vitest'
import { accountsModeFrom, authLimitsFrom, DEVELOPMENT_AUTH_LIMITS, limitsFrom } from '../src/index'

describe('accountsModeFrom', () => {
  it('is off unless it is on', () => {
    expect(accountsModeFrom({})).toBe('off')
    expect(accountsModeFrom({ ARABLYZER_ACCOUNTS: '' })).toBe('off')
    expect(accountsModeFrom({ ARABLYZER_ACCOUNTS: 'off' })).toBe('off')
    expect(accountsModeFrom({ ARABLYZER_ACCOUNTS: 'on' })).toBe('on')
  })
  it('refuses anything else', () => {
    expect(() => accountsModeFrom({ ARABLYZER_ACCOUNTS: 'yes' })).toThrow(
      /ARABLYZER_ACCOUNTS is on or off/,
    )
  })
})

describe('authLimitsFrom', () => {
  it('keeps the development values outside production', () => {
    expect(authLimitsFrom({})).toEqual(DEVELOPMENT_AUTH_LIMITS)
  })
  it('reads both numbers, and refuses to start in production without them', () => {
    const set = {
      ARABLYZER_LIMIT_SIGNIN_REQUESTS: '12',
      ARABLYZER_LIMIT_SIGNIN_SECONDS: '300',
    }
    expect(authLimitsFrom({ NODE_ENV: 'production', ...set }).signIn).toEqual({
      scans: 12,
      seconds: 300,
    })
    expect(() => authLimitsFrom({ NODE_ENV: 'production' })).toThrow(
      /ARABLYZER_LIMIT_SIGNIN_REQUESTS must be set in production/,
    )
  })
  it.each(['0', '-1', '1.5', 'ten', '1e3'])('refuses %s', (value) => {
    expect(() => authLimitsFrom({ ARABLYZER_LIMIT_SIGNIN_REQUESTS: value })).toThrow(/whole number/)
  })
  it('is frozen, and needs none of the scan variables', () => {
    const limits = authLimitsFrom({
      NODE_ENV: 'production',
      ARABLYZER_LIMIT_SIGNIN_REQUESTS: '1',
      ARABLYZER_LIMIT_SIGNIN_SECONDS: '1',
    })
    expect(Object.isFrozen(limits)).toBe(true)
    expect(Object.isFrozen(limits.signIn)).toBe(true)
    expect(() => limitsFrom({ NODE_ENV: 'production' })).toThrow()
  })
})
