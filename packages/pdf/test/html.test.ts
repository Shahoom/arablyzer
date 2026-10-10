import { describe, expect, it } from 'vitest'
import { esc, fixBlocks, renderHtml, type PdfDocument } from '../src/index'

const base: PdfDocument = {
  v: 1,
  lang: 'ar',
  kind: 'scan',
  title: 'تقرير',
  brand: null,
  mark: 'Arablyzer',
  cover: {
    kicker: 'تقرير فحص صفحة',
    heading: 'example.com',
    sub: 'https://example.com/',
    score: 82,
    scoreLabel: 'الدرجة العامة',
    scoreNote: 'ملاحظة',
    facts: [{ label: 'الصفحة', value: 'https://example.com/' }],
  },
  sections: [],
  footer: { line: 'Arablyzer · 10 أكتوبر 2026', of: 'من' },
}

describe('renderHtml', () => {
  it('is right to left for Arabic and left to right for English, with no script', () => {
    const ar = renderHtml(base)
    expect(ar).toContain('<html lang="ar" dir="rtl">')
    expect(renderHtml({ ...base, lang: 'en' })).toContain('<html lang="en" dir="ltr">')
    expect(ar).not.toMatch(/<script/i)
    expect(ar).toContain("default-src 'none'")
    // The site's own fonts, inlined, and no address to load anything from.
    expect(ar).toContain("font-family:'IBM Plex Sans Arabic'")
    expect(ar).toContain("font-family:'DM Sans'")
    expect(ar).toContain("font-family:'IBM Plex Mono'")
    expect(ar).not.toMatch(/(?:src|href)="https?:/)
  })

  it('escapes whatever a scanned site wrote, in every place it can land', () => {
    const evil = '"><img src=x onerror=alert(1)><script>alert(2)</script>'
    const html = renderHtml({
      ...base,
      title: evil,
      cover: { ...base.cover, heading: evil, sub: evil, facts: [{ label: evil, value: evil }] },
      footer: { line: evil, of: evil },
      sections: [
        {
          heading: evil,
          blocks: [
            { t: 'p', text: evil },
            { t: 'p', text: `\`${evil}\`` },
            { t: 'list', ordered: false, items: [evil] },
            { t: 'code', text: evil },
            { t: 'table', head: [evil], rows: [[evil]] },
            { t: 'stats', items: [{ label: evil, value: evil }] },
            {
              t: 'issue',
              severity: 'critical',
              chip: evil,
              title: evil,
              meta: evil,
              lines: [evil],
              fixLabel: evil,
              fix: [{ t: 'p', text: evil }],
            },
          ],
        },
      ],
    })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('onerror=alert(1)>')
    expect(esc(evil)).toBe(
      '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;&lt;script&gt;alert(2)&lt;/script&gt;',
    )
    // The footer text lands in a CSS string: nothing in it can end the string or the style.
    expect(html).not.toContain('"><img')
    const style = html.slice(html.lastIndexOf('<style>'), html.lastIndexOf('</style>'))
    expect(style).not.toContain('</style')
  })

  it('draws the company’s mark and colour in place of Arablyzer’s, with the credit line when the plan keeps it', () => {
    const html = renderHtml({
      ...base,
      brand: {
        name: 'شركة النور',
        color: '#0b3d2e',
        logo: { type: 'image/png', data: 'AAAA' },
        credit: 'بواسطة Arablyzer',
      },
    })
    expect(html).toContain('--brand:#0b3d2e')
    expect(html).toContain('<span class="mark">شركة النور</span>')
    expect(html).toContain('src="data:image/png;base64,AAAA"')
    expect(html).toContain('<span class="credit">بواسطة Arablyzer</span>')
    expect(html).not.toContain('<span class="mark">Arablyzer</span>')
    const without = renderHtml({
      ...base,
      brand: { name: 'X', color: '#0b3d2e', logo: null, credit: '' },
    })
    expect(without).not.toContain('class="credit"')
  })
})

describe('fixBlocks', () => {
  it('reads the rules’ small Markdown: lists, fenced code, paragraphs and code spans', () => {
    const blocks = fixBlocks(
      '- أضف `alt` للصورة\n- اكتب `alt=""`\n\nثم راجع **الصفحة**:\n\n```js\ntext.normalize(\'NFKC\')\n```\n\n1. خطوة\n2. خطوة أخرى',
    )
    expect(blocks).toEqual([
      { t: 'list', ordered: false, items: ['أضف `alt` للصورة', 'اكتب `alt=""`'] },
      { t: 'p', text: 'ثم راجع الصفحة:' },
      { t: 'code', text: "text.normalize('NFKC')" },
      { t: 'list', ordered: true, items: ['خطوة', 'خطوة أخرى'] },
    ])
  })
})
