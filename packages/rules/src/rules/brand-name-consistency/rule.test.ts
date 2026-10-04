import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'
import { copyrightName, logoName } from '../../lib/brand-names'
import { nameKey } from '../../lib/ar-normalize'

const found = (head: string, body = '') =>
  detectAll(
    rule,
    evidenceOf(
      htmlPage(
        `<!doctype html><html lang="ar"><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`,
      ),
    ),
  )

describe('brand-name-consistency', () => {
  it('finds a different name, a different spelling, and a missing alternateName', async () => {
    const findings = detectAll(rule, await fixtureEvidence(rule.id, 'wrong'))
    const kinds = findings.map((finding) => finding.message)
    expect(kinds).toContain('spelling')
    expect(kinds).toContain('disagree')
    expect(kinds).toContain('alternate-missing')
    expect(findings.find((f) => f.message === 'disagree')?.values).toMatchObject({
      firstSource: 'og:site_name',
      second: 'متجر النخلة',
      secondSource: 'copyright',
    })
    expect(findings.find((f) => f.message === 'alternate-missing')?.values).toMatchObject({
      latin: 'Al Waha Store',
      latinSource: 'Organization.name',
    })
  })

  it('passes a page that spells and pairs its names', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
  })

  it('folds hamza, ta marbuta, alef maqsura, tatweel, diacritics, case and punctuation', () => {
    expect(nameKey('إِكسترا')).toBe(nameKey('اكســترا'))
    expect(nameKey('الواحة')).toBe(nameKey('الواحه'))
    expect(nameKey('مستشفى')).toBe(nameKey('مستشفي'))
    expect(nameKey('Al-Waha & Co.')).toBe(nameKey('al waha and co'))
  })

  it('treats a store and its brand as one name, and different brands as two', () => {
    expect(
      found(
        '<meta property="og:site_name" content="Waha Store"><script type="application/ld+json">{"@type":"Organization","name":"Waha"}</script>',
      ),
    ).toEqual([])
    const [finding] = found(
      '<meta property="og:site_name" content="Waha"><script type="application/ld+json">{"@type":"Organization","name":"Oasis"}</script>',
    )
    expect(finding?.message).toBe('disagree')
  })

  it('does not compare an Arabic name with a Latin one, and asks for the pairing', () => {
    const findings = found(
      '<meta property="og:site_name" content="متجر الواحة"><script type="application/ld+json">{"@type":"Organization","name":"Waha"}</script>',
    )
    expect(findings.map((f) => f.message)).toEqual(['alternate-missing'])
    expect(
      found(
        '<meta property="og:site_name" content="متجر الواحة"><script type="application/ld+json">{"@type":"Organization","name":"Waha","alternateName":"متجر الواحة"}</script>',
      ),
    ).toEqual([])
  })

  it('reads a copyright line and a logo alt', () => {
    expect(copyrightName('© 2026 Waha Trading LLC. All rights reserved.')).toBe('Waha Trading')
    expect(copyrightName('جميع الحقوق محفوظة لمتجر الواحة 2026')).toBe('متجر الواحة 2026')
    expect(copyrightName('Our story')).toBeNull()
    expect(logoName('شعار متجر الواحة')).toBe('متجر الواحة')
    expect(logoName('Waha logo')).toBe('Waha')
  })

  it('says nothing when the page names no brand', () => {
    expect(found('<title>صفحة</title>')).toEqual([])
  })
})
