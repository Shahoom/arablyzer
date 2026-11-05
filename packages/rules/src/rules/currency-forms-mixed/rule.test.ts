import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const page = (text: string) =>
  htmlPage(
    `<html lang="ar"><body><p>${text} نص عربي كافٍ لتكون الصفحة عربية بالكامل ويقرؤها الفاحص.</p></body></html>`,
  )
const found = (text: string) =>
  detectAll(rule, evidenceOf(page(text))).map((finding) => [
    finding.values?.currency,
    finding.values?.forms,
  ])

describe('currency-forms-mixed', () => {
  it('fails the wrong fixture: riyals as ر.س and as SAR', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(
      detectAll(rule, evidence).map((finding) => [finding.message, finding.values?.forms]),
    ).toEqual([['mixed', 'ر.س · SAR']])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it.each([
    ['5 د.ك و 7 KD', [['KWD', 'د.ك · KD']]],
    ['SAR 50 و 60 ر.س و 70 ريال سعودي', [['SAR', 'ر.س · SAR · ريال سعودي']]],
    ['10 OMR و 4 ر.ع', [['OMR', 'ر.ع · OMR']]],
    ['50 درهم إماراتي و AED 20', [['AED', 'AED · درهم إماراتي']]],
    ['50 ر.س و 20 AED', []],
  ])('%s', (text, expected) => {
    expect(found(text)).toEqual(expected)
  })

  it('counts a form only beside a number', () => {
    expect(found('ندفع بـ SAR أو ر.س حسب البلد')).toEqual([])
    expect(found('الرمز SAR هو رمز الريال ، وسعره 50 ر.س')).toEqual([])
  })

  it('does not take letters of a word for a form', () => {
    expect(found('50 SARAH و 50 ر.س')).toEqual([])
  })

  it('does not apply to a page that is not Arabic', () => {
    expect(
      rule.appliesTo(htmlPage('<html lang="en"><body><p>Price 50 SAR and 60 SR</p></body></html>')),
    ).toBe(false)
  })

  it('leaves a quoted example, which a page talks about and does not state', () => {
    expect(found('تكتب «50 ر.س» و«50 SAR» كلتيهما')).toEqual([])
  })
})
