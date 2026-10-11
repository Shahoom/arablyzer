import { describe, expect, it } from 'vitest'
import { LEGAL_UI, LEGAL_UPDATED, PRIVACY_EMAIL, SECURITY_EMAIL } from '../src/legal'

const PAGES = ['privacy', 'terms', 'security'] as const
const ARABIC_LETTER = /(?=\p{L})\p{Script=Arabic}/u

const textOf = (page: (typeof LEGAL_UI)['ar']['privacy']): string =>
  page.sections
    .flatMap((s) => [s.title, ...(s.paragraphs ?? []), ...(s.items ?? []), ...(s.after ?? [])])
    .join('\n')

describe('the legal pages (M5.3)', () => {
  it('are unreviewed Arabic with English beside them, dated', () => {
    expect(LEGAL_UI.reviewed).toBe(false)
    expect(LEGAL_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Date.parse(`${LEGAL_UPDATED}T00:00:00+14:00`)).toBeLessThanOrEqual(Date.now())
    for (const page of PAGES) {
      expect(LEGAL_UI.ar[page].title).toMatch(ARABIC_LETTER)
      expect(LEGAL_UI.en[page].title).not.toMatch(ARABIC_LETTER)
    }
  })

  it('have the same sections, with unique ids, a title and some content, in both languages', () => {
    for (const page of PAGES) {
      const ar = LEGAL_UI.ar[page].sections
      const en = LEGAL_UI.en[page].sections
      expect(
        en.map((s) => s.id),
        page,
      ).toEqual(ar.map((s) => s.id))
      expect(new Set(ar.map((s) => s.id)).size).toBe(ar.length)
      for (const section of [...ar, ...en]) {
        expect(section.title, `${page}/${section.id}`).not.toBe('')
        const body =
          (section.paragraphs?.length ?? 0) +
          (section.items?.length ?? 0) +
          (section.after?.length ?? 0)
        expect(body, `${page}/${section.id}`).toBeGreaterThan(0)
        expect(section.items?.length ?? 1, `${page}/${section.id}`).toBeGreaterThan(0)
      }
    }
  })

  it('say what the Search Console flow does, as the code does it', () => {
    for (const lang of ['ar', 'en'] as const) {
      const privacy = textOf(LEGAL_UI[lang].privacy)
      // The one scope, the cookie the flow sets, and Google's Limited Use wording.
      expect(privacy).toContain('https://www.googleapis.com/auth/webmasters.readonly')
      expect(privacy).toContain('`arablyzer_gsc`')
      expect(privacy).toContain('Limited Use')
      expect(privacy).toContain('Google API Services User Data Policy')
      expect(privacy).toContain(PRIVACY_EMAIL)
    }
    expect(textOf(LEGAL_UI.en.privacy)).toContain('five minutes')
    expect(textOf(LEGAL_UI.en.privacy)).toContain('10 minutes')
  })

  it('give the address vulnerabilities are reported to, on the security page and nowhere else wrongly', () => {
    expect(SECURITY_EMAIL).toBe('security@arablyzer.com')
    for (const lang of ['ar', 'en'] as const) {
      expect(textOf(LEGAL_UI[lang].security)).toContain(`\`${SECURITY_EMAIL}\``)
      expect(textOf(LEGAL_UI[lang].security)).toContain('/.well-known/security.txt')
    }
  })

  it('are meta-described within a search result’s reach', () => {
    for (const lang of ['ar', 'en'] as const) {
      for (const page of PAGES) {
        const { meta } = LEGAL_UI[lang][page]
        expect(meta.title.length).toBeLessThanOrEqual(70)
        expect(meta.description.length).toBeGreaterThan(40)
        expect(meta.description.length).toBeLessThanOrEqual(200)
      }
    }
  })
})
