import { describe, expect, it } from 'vitest'
import { reportsOnly } from '../src/index'

// M2.3c review: a tool whose rules are all information (severity info) lists what a page shows and
// judges nothing. Its result says what it found, as notes, and "none found" where it found nothing.
describe('reportsOnly', () => {
  it('is true for rules that are all information', () => {
    expect(reportsOnly(['payment-methods'])).toBe(true)
    expect(reportsOnly(['rtl-physical-css'])).toBe(true)
    expect(reportsOnly(['payment-methods', 'referrer-policy-missing'])).toBe(true)
  })

  it('is false once one rule judges something', () => {
    expect(reportsOnly(['payment-methods', 'title-missing'])).toBe(false)
    expect(reportsOnly(['hsts-missing', 'csp-missing', 'referrer-policy-missing'])).toBe(false)
  })

  it('is false for no rules, and for a rule that does not exist', () => {
    expect(reportsOnly([])).toBe(false)
    expect(reportsOnly(['no-such-rule'])).toBe(false)
  })
})
