import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const inBody = (html: string) =>
  detectAll(rule, evidenceOf(htmlPage(`<html lang="ar"><body>${html}</body></html>`)))
const kinds = (html: string) => inBody(html).map((finding) => finding.message)

describe('ar-ai-readability', () => {
  it('fires for each kind of text a machine reads badly, with a count and the first example', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    const findings = detectAll(rule, evidence)
    expect(findings.map((finding) => finding.message)).toEqual([
      'tatweel',
      'invisible',
      'digits',
      'diacritics',
      'presentation',
    ])
    expect(findings[0]?.values).toEqual({ count: 2, example: 'الـعـروض', clean: 'العروض' })
    expect(findings[1]?.values).toEqual({ count: 1, example: 'ال⟨U+200B⟩عود' })
    expect(findings[2]?.values).toEqual({ count: 1, example: '٢٠٢4' })
    expect(findings[4]?.values).toMatchObject({ normalized: 'مرحبا' })
  })

  it('passes clean text, one digit set, and the symbols ﷺ ﷼', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
  })

  it('counts a direction mark inside a word, and not one between words', () => {
    expect(kinds('<p>العر\u200fوض الخاصة\u200f جدا</p>')).toEqual(['invisible'])
    expect(kinds('<p>العروض الخاصة \u200f(Offers) جدا</p>')).toEqual([])
  })

  it('leaves vowelled text a few marks thick, Quranic text and code alone', () => {
    expect(
      kinds('<p>هَذَا نَصٌّ عَادِيٌّ فِيهِ بَعْضُ الْكَلِمَاتِ الْمُشَكَّلَةِ فَقَطْ</p>'),
    ).toEqual([])
    expect(kinds('<code>الـعـروض</code><p>نص عربي طويل يكفي ليكون أغلب الحروف عربية</p>')).toEqual(
      [],
    )
  })

  it('reports Arabic that is in pictures when the page has little text of its own', () => {
    const [finding] = inBody(
      '<h1>أهلا</h1><img src="a.jpg" alt="عروض الصيف على جميع العطور الفاخرة والهدايا المميزة حتى نهاية الشهر الحالي"><img src="b.jpg" alt="شعار المتجر">',
    )
    expect(finding?.message).toBe('image-text')
    expect(finding?.values).toMatchObject({ count: 1 })
  })

  it('does not report the pictures of a page with its own text', () => {
    const text =
      '<p>نص عربي طويل يكفي ليكون أغلب الحروف عربية في الصفحة، ويزيد على الحد الأدنى للنص الذي تحمله بنفسها.</p>'
    expect(
      kinds(
        `${text}<img src="a.jpg" alt="عروض الصيف على جميع العطور الفاخرة والهدايا المميزة حتى نهاية الشهر الحالي">`,
      ),
    ).toEqual([])
  })
})
