import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const page = (text: string) =>
  htmlPage(
    `<html lang="ar"><body><p>${text} نص عربي كافٍ لتكون الصفحة عربية بالكامل ويقرؤها الفاحص.</p></body></html>`,
  )
const found = (text: string) =>
  detectAll(rule, evidenceOf(page(text))).map((finding) => finding.message)

describe('number-separators-mixed', () => {
  it('fails the wrong fixture: Arabic marks beside a Latin comma', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence).map((finding) => finding.message)).toEqual(['mixed'])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it.each([
    ['١٬٢٥٠٫٥٠ و 1,250.50', ['mixed']],
    ['١٬٢٥٠ و 12.5', ['mixed']],
    ['١٬٢٥٠٫٥٠ و ٣٬٥٠٠', []],
    ['1,250.50 و 3,500', []],
    ['١،٥٠٠ ريال', ['arabic-comma']],
    ['هذا، وذاك. ثم ٥ أو ٦', []],
    ['الإصدار 6.4.2 والتاريخ 05.03.2026 و ١٬٢٥٠', []],
  ])('%s', (text, expected) => {
    expect(found(text)).toEqual(expected)
  })

  it('leaves a quoted example, which a page talks about and does not state', () => {
    expect(found('اكتب «١٬٢٥٠» لا «1,250.50» ولا «1،500»')).toEqual([])
  })
})
