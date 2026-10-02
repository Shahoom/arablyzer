import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cardHtml, tokensFrom, type CardFonts } from '../scripts/og-card'
import { kickerOf, pageText } from '../scripts/og-images'

const FONTS: CardFonts = {
  arabic400: new Uint8Array([1]),
  arabic600: new Uint8Array([2]),
  latin400: new Uint8Array([3]),
  latin600: new Uint8Array([4]),
  mono600: new Uint8Array([5]),
}
const TOKENS = tokensFrom(
  readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8'),
)

describe('tokensFrom', () => {
  it("reads the card's colours from the site's tokens, so a redesign redraws the cards", () => {
    expect(TOKENS.ink).toMatch(/^#[0-9a-f]{6}$/i)
    expect(TOKENS.signal).toMatch(/^#[0-9a-f]{6}$/i)
    expect(() => tokensFrom(':root{}')).toThrow(/--color-bg/)
  })
})

describe('cardHtml', () => {
  const html = (title: string, lang: 'ar' | 'en' = 'ar') =>
    cardHtml(
      { lang, kicker: 'الاتجاه RTL', title, description: 'وصف <b>', host: 'arablyzer.example' },
      TOKENS,
      FONTS,
    )

  it('isolates the Latin in Arabic text, as the pages do, and escapes everything', () => {
    const card = html('صفحة عربية بلا dir="rtl" في وسم html')
    expect(card).toContain('<bdi dir="ltr">dir=&quot;rtl&quot;</bdi>')
    expect(card).toContain('وصف <bdi dir="ltr">&lt;b&gt;</bdi>')
    expect(card).not.toContain('<b>')
    expect(card).toContain('<html lang="ar" dir="rtl">')
  })

  it('loads nothing: its fonts are inline', () => {
    const card = html('عنوان')
    expect(card).not.toMatch(/https?:\/\//)
    expect(card).toContain('data:font/woff2;base64,')
  })
})

describe('pageText and kickerOf', () => {
  it("takes a page's heading, or its title for a page whose script writes the heading", () => {
    expect(
      pageText(
        '<title>x — Arablyzer</title><meta name="description" content="a &amp; b"><h1>عنوان <bdi>RTL</bdi></h1>',
      ),
    ).toEqual({ title: 'عنوان RTL', description: 'a & b' })
    expect(pageText('<title>تقرير Arablyzer — Arablyzer</title>')).toEqual({
      title: 'تقرير Arablyzer',
      description: '',
    })
  })

  it("says what the page is: a tool's category, a rule's id, a section", () => {
    expect(kickerOf({ path: '/rules/title-missing', file: '', lang: 'ar' })).toEqual({
      kicker: 'title-missing',
      kickerCode: true,
    })
    expect(kickerOf({ path: '/en/tools', file: '', lang: 'en' }).kicker).toBe('Tools')
    // The knowledge hub's card says what the section is called in the header.
    expect(kickerOf({ path: '/knowledge', file: '', lang: 'ar' }).kicker).toBe('المعرفة')
    expect(kickerOf({ path: '/en/knowledge', file: '', lang: 'en' }).kicker).toBe('Knowledge')
    expect(() => kickerOf({ path: '/somewhere', file: '', lang: 'ar' })).toThrow(/add one/)
  })
})
