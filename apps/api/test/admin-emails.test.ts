import { describe, expect, it } from 'vitest'
import { adminEmailsFrom, isAdmin } from '../src/admin/emails'

describe('adminEmailsFrom', () => {
  it('names nobody unless the variable is set', () => {
    expect(adminEmailsFrom({})).toEqual([])
    expect(adminEmailsFrom({ ARABLYZER_ADMIN_EMAILS: '  ' })).toEqual([])
  })

  it('reads comma-separated lower-case addresses, once each', () => {
    expect(
      adminEmailsFrom({ ARABLYZER_ADMIN_EMAILS: ' a@example.com, b@example.org ,,a@example.com' }),
    ).toEqual(['a@example.com', 'b@example.org'])
  })

  it('stops the start on an address in upper case, or not an address', () => {
    expect(() => adminEmailsFrom({ ARABLYZER_ADMIN_EMAILS: 'Ali@example.com' })).toThrow(
      /lower-case/,
    )
    for (const bad of [
      'ali',
      'a@b',
      'a b@example.com',
      'a@example.com;b@example.com',
      '@example.com',
    ]) {
      expect(() => adminEmailsFrom({ ARABLYZER_ADMIN_EMAILS: bad }), bad).toThrow(
        /ARABLYZER_ADMIN_EMAILS/,
      )
    }
  })
})

describe('isAdmin', () => {
  const admins = ['boss@example.com']
  it('is an exact match on an address Google vouched for', () => {
    expect(isAdmin(admins, { email: 'boss@example.com', emailVerified: true })).toBe(true)
    expect(isAdmin(admins, { email: 'boss@example.com', emailVerified: false })).toBe(false)
    expect(isAdmin(admins, { email: 'boss@example.com' })).toBe(false)
    expect(isAdmin(admins, { email: 'Boss@example.com', emailVerified: true })).toBe(false)
    expect(isAdmin(admins, { email: 'boss@example.com.evil.test', emailVerified: true })).toBe(
      false,
    )
    expect(isAdmin([], { email: 'boss@example.com', emailVerified: true })).toBe(false)
  })
})
