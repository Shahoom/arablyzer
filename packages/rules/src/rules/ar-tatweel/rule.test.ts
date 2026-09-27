import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const inBody = (html: string) =>
  detectAll(rule, evidenceOf(htmlPage(`<html lang="ar"><body>${html}</body></html>`)))

describe('ar-tatweel', () => {
  it('fires on words stretched with tatweel between their letters', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([
      {
        message: 'stretched',
        values: { word: 'الـعـروض', clean: 'العروض', count: 2 },
        selector: 'body > main > h1',
        location: { line: 14 },
        key: 'body > main > h1#0',
      },
    ])
  })

  it('passes tatweel after a final letter before a Latin word, and lines of tatweel', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
  })

  it('reads harakat between the letters and the tatweel', () => {
    const [finding] = inBody(
      '<p>مرحباً بكم في مُـحـمّـد للعطور، أهلاً وسهلاً بكل الزوار الكرام</p>',
    )
    expect(finding?.values).toEqual({ word: 'مُـحـمّـد', clean: 'مُحمّد', count: 1 })
  })

  it('leaves code alone', () => {
    expect(inBody('<p>نص عربي طويل يكفي ليكون أغلب الحروف عربية</p><code>مـحـمـد</code>')).toEqual(
      [],
    )
  })
})
