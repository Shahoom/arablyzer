import { describe, expect, it } from 'vitest'
import {
  accountHref,
  isAccountSummary,
  loginHref,
  problemFromQuery,
  problemOf,
} from '../src/islands/auth-model'

describe('accountHref and loginHref', () => {
  it('are the pages of the language, and nothing else', () => {
    expect(accountHref('ar')).toBe('/account')
    expect(accountHref('en')).toBe('/en/account')
    expect(loginHref('ar')).toBe('/login')
    expect(loginHref('en')).toBe('/en/login')
  })
})

describe('problemOf', () => {
  it('keeps the code of an answer of ours, and the wait', () => {
    expect(problemOf(429, { error: 'rate-limited', retryAfterSeconds: 60 })).toEqual({
      problem: 'rate-limited',
      retryAfterSeconds: 60,
    })
    expect(problemOf(400, { error: 'invalid-token' })).toEqual({ problem: 'invalid-token' })
    expect(problemOf(403, { error: 'fresh-login-required' })).toEqual({
      problem: 'fresh-login-required',
    })
  })
  it('does not trust a wait that is not a number above zero', () => {
    expect(problemOf(429, { error: 'rate-limited', retryAfterSeconds: -5 })).toEqual({
      problem: 'rate-limited',
    })
    expect(problemOf(429, { error: 'rate-limited', retryAfterSeconds: 'soon' })).toEqual({
      problem: 'rate-limited',
    })
  })
  it('reads an answer that is not ours as the service being away', () => {
    expect(problemOf(502, '<html>Bad gateway</html>')).toEqual({ problem: 'unavailable' })
    expect(problemOf(500, { error: 'something else' })).toEqual({ problem: 'unavailable' })
    expect(problemOf(401, null)).toEqual({ problem: 'unauthorized' })
  })
})

describe('isAccountSummary', () => {
  const good = { id: 'u', email: 'a@b.co', name: 'A', language: null, createdAt: '2026-10-01' }
  it('takes an account with a language or none, and nothing less', () => {
    expect(isAccountSummary(good)).toBe(true)
    expect(isAccountSummary({ ...good, language: 'en' })).toBe(true)
    expect(isAccountSummary({ ...good, language: 'fr' })).toBe(false)
    expect(isAccountSummary({ ...good, email: 1 })).toBe(false)
    expect(isAccountSummary(null)).toBe(false)
    expect(isAccountSummary('x')).toBe(false)
  })
})

describe('problemFromQuery', () => {
  it('is nothing when there is no error', () => {
    expect(problemFromQuery('')).toBeNull()
    expect(problemFromQuery('?lang=en')).toBeNull()
    expect(problemFromQuery('?error=')).toBeNull()
  })
  it('names what the return from Google says', () => {
    expect(problemFromQuery('?error=email_not_verified&error_description=x')).toBe('unverified')
    expect(problemFromQuery('?error=email_not_found')).toBe('unverified')
    expect(problemFromQuery('?error=access_denied')).toBe('cancelled')
    expect(problemFromQuery('?error=rate-limited')).toBe('rate-limited')
    expect(problemFromQuery('?error=unavailable')).toBe('unavailable')
    expect(problemFromQuery('?error=state_mismatch')).toBe('failed')
    expect(problemFromQuery('?error=<script>')).toBe('failed')
  })
})
