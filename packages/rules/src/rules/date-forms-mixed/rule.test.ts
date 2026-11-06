import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const page = (text: string) =>
  htmlPage(
    `<html lang="ar"><body><p>${text} نص عربي كافٍ لتكون الصفحة عربية بالكامل ويقرؤها الفاحص.</p></body></html>`,
  )
const found = (text: string) =>
  detectAll(rule, evidenceOf(page(text))).map((finding) => finding.message)

describe('date-forms-mixed', () => {
  it('fails the wrong fixture: months of two regions, and two numeric forms', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence).map((finding) => finding.message)).toEqual([
      'month-names',
      'numeric',
    ])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it.each([
    ['5 مارس 2026 و 7 كانون الثاني 2025', ['month-names']],
    ['آذار 2026 ثم أبريل 2026', ['month-names']],
    ['5 يناير 2026 و 7 فبراير 2026', []],
    ['5 كانون الثاني 2026 و 7 شباط 2026', []],
    ['2026-03-05 و 05/03/2026', ['numeric']],
    ['٢٠٢٦-٠٣-٠٥ و ٠٥/٠٣/٢٠٢٦', ['numeric']],
    ['2026-03-05 و 2026-04-01', []],
    ['05/03/2026 و 7.4.2026', []],
  ])('%s', (text, expected) => {
    expect(found(text)).toEqual(expected)
  })

  it('takes a word that spells like a month for one only beside a number', () => {
    expect(found('هو يمارس الرياضة و مارس عمله، وفي 5 يناير 2026 ثم أيار الماضي')).toEqual([])
  })

  it('does not read a version or a time as a date', () => {
    expect(found('الإصدار 2026.03.05 و 12/1/2026/4')).toEqual([])
  })

  it('leaves a quoted example, which a page talks about and does not state', () => {
    expect(found('اكتب «2026-03-05» لا «05/03/2026»')).toEqual([])
  })
})
