import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const detect = (body: string) =>
  detectAll(rule, evidenceOf(htmlPage(`<html lang="ar" dir="rtl"><body>${body}</body></html>`)))

describe('ar-latin-punctuation', () => {
  it('fires once per Latin mark on the wrong fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    const findings = detectAll(rule, evidence)
    expect(findings.map((finding) => [finding.values?.found, finding.values?.suggested])).toEqual([
      ['?', '؟'],
      [',', '،'],
      [';', '؛'],
    ])
    expect(findings[0]).toMatchObject({
      selector: 'body > main > p:nth-of-type(1)',
      location: { line: 11 },
      snippet: 'هل تريد المساعدة? تواصل معنا, نحن هنا طوال أيام الأسبوع.',
    })
  })

  it('passes the right fixture: Arabic marks, 1,500, React, Vue and code', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('sees through diacritics, tatweel and inline elements', () => {
    expect(detect('<p>أهلاً, وسهلاً</p>')).toHaveLength(1)
    expect(detect('<p>جميـــل, جداً</p>')).toHaveLength(1)
    expect(detect('<p><b>مرحبا</b>, كيف حالك</p>')).toHaveLength(1)
    expect(detect('<p><b>مرحبا</b></p><p>, كيف حالك</p>')).toEqual([])
  })

  it('ignores digits, Latin words, code and URLs', () => {
    expect(detect('<p>السعر ١,٥٠٠ ريال أو 1,500 ريال مع React, Vue</p>')).toEqual([])
    expect(detect('<p>مثال: <code>قائمة = [أ, ب]</code> و<pre>س; ص</pre></p>')).toEqual([])
    expect(detect('<p>زوروا https://example.com/بحث?q=1 أو موقع/صفحة?</p>')).toEqual([])
  })

  it('gives each mark its own snippet and key', () => {
    const findings = detect(`<p>${'كلمة, '.repeat(3)}</p>`)
    expect(findings).toHaveLength(3)
    expect(new Set(findings.map((finding) => finding.key)).size).toBe(3)
  })

  it('stays linear in the length of a text node (M0.2 review)', () => {
    let start = performance.now()
    expect(detect(`<p>${'ب'.repeat(100_000)} ب,</p>`)).toHaveLength(1)
    expect(performance.now() - start).toBeLessThan(1000)
    start = performance.now()
    expect(detect(`<p>${'ب, '.repeat(20_000)}</p>`)).toHaveLength(20_000)
    const noSpaces = detect(`<p>${'ب,'.repeat(20_000)}</p>`)
    expect(noSpaces).toHaveLength(20_000)
    expect(performance.now() - start).toBeLessThan(2000)
  })

  it('does not apply to pages that are not mostly Arabic', () => {
    expect(rule.appliesTo(htmlPage('<p>The word مرحبا, means hello</p>'))).toBe(false)
  })
})
