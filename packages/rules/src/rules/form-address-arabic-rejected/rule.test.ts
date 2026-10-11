import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const page = (field: string, lang = 'ar') =>
  htmlPage(
    `<html lang="${lang}"><body><p>${lang === 'ar' ? 'متجر الواحة للعطور والبخور' : 'The Oasis perfume shop'}</p><form>${field}</form></body></html>`,
  )
const found = (field: string) => detectAll(rule, evidenceOf(page(field)))

describe('form-address-arabic-rejected', () => {
  it('fails the wrong fixture: city and street patterns that take Latin letters only', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(
      detectAll(rule, evidence).map((finding) => [finding.message, finding.values?.address]),
    ).toEqual([
      ['rejected', 'الرياض'],
      ['rejected', 'الرياض'],
    ])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('names the first Arabic address the pattern refuses and a Latin one it takes', () => {
    const [finding] = found('<input name="city" pattern="[A-Za-z ]{2,40}">')
    expect(finding).toMatchObject({
      values: { address: 'الرياض', accepted: 'Riyadh', pattern: '[A-Za-z ]{2,40}' },
      selector: 'body > form > input',
    })
  })

  it.each([
    ['<input name="address_line1" pattern="[A-Za-z0-9 ,]+">', 1],
    ['<input name="shipping" autocomplete="shipping street-address" pattern="[A-Za-z ]+">', 1],
    ['<label for="d">الحي</label><input id="d" name="x" pattern="[A-Za-z ]+">', 1],
    ['<input name="district" pattern="[\\p{L} ]+">', 0],
    ['<input name="city" pattern="[^0-9]+">', 0],
    ['<input name="city">', 0],
    ['<input name="city" pattern="\\d+">', 0],
    ['<input name="city" pattern="[A-Za-z ]{4,40}">', 1],
    ['<input name="city" pattern="[\\p{L} ]{9}">', 0],
  ])('%s → %i finding(s)', (field, count) => {
    expect(found(field)).toHaveLength(count)
  })

  it('leaves out fields that are not a place: an email address, a phone, a postal code', () => {
    for (const field of [
      '<input name="email_address" pattern="[a-z@.]+">',
      '<label for="e">البريد الإلكتروني</label><input id="e" name="x" pattern="[a-z@.]+">',
      '<input name="billing_phone" pattern="[0-9]+">',
      '<input name="zip" pattern="[0-9]+">',
      '<input name="country" pattern="[A-Za-z ]+">',
      '<input name="site_address" type="url" pattern="https://.+">',
    ]) {
      expect(rule.appliesTo(page(field)), field).toBe(false)
    }
  })

  it('applies to Arabic pages only', () => {
    expect(rule.appliesTo(page('<input name="city" pattern="[A-Za-z ]+">', 'en'))).toBe(false)
  })
})
