import { describe, expect, it } from 'vitest'
import { BLOG_TAGS, BLOG_UI, SITE, VERSUS_SLUGS, VERSUS_UI } from '../src/index'

// The blog's and the comparisons' copy (M6): what it says of a count, and that the two languages
// of each comparison say the same thing in the same cells.

describe('the blog’s copy', () => {
  it('counts articles and minutes as Arabic does', () => {
    const { count } = BLOG_UI.ar
    expect([1, 2, 3, 10, 11, 100].map((n) => count(n))).toEqual([
      'مقال واحد',
      'مقالان',
      '3 مقالات',
      '10 مقالات',
      '11 مقالاً',
      '100 مقال',
    ])
    const { readingTime } = BLOG_UI.ar.article
    expect([1, 2, 5, 11].map((n) => readingTime(n))).toEqual([
      'قراءة في دقيقة واحدة',
      'قراءة في دقيقتين',
      'قراءة في 5 دقائق',
      'قراءة في 11 دقيقة',
    ])
    expect(BLOG_UI.en.count(1)).toBe('1 article')
    expect(BLOG_UI.en.article.readingTime(6)).toBe('6 minutes to read')
  })

  it('names and describes every tag in both languages, and builds a tag page’s title from it', () => {
    for (const lang of ['ar', 'en'] as const) {
      for (const tag of BLOG_TAGS) {
        const { name, description } = BLOG_UI[lang].tags[tag]
        expect(name.length).toBeGreaterThan(2)
        expect(description.length).toBeGreaterThan(30)
      }
    }
    expect(BLOG_UI.ar.tagPage.title('الخطوط')).toBe('مقالات عن الخطوط')
    expect(BLOG_UI.ar.tagPage.description('الخطوط', 3)).toContain('3 مقالات عن الخطوط')
    expect(BLOG_UI.en.tagPage.description('Fonts', 2)).toContain('2 articles on Fonts')
  })

  it('puts the blog in the header and the comparisons in the footer, in both languages', () => {
    expect(SITE.ar.nav.blog).toBe('المقالات')
    expect(SITE.en.nav.blog).toBe('Articles')
    expect(SITE.ar.footer.compare).toBe('مقارنات')
    expect(SITE.en.footer.compare).toBe('Comparisons')
  })
})

describe('the comparisons’ copy', () => {
  it('has a page for each competitor, with a cell for each row, in both languages', () => {
    for (const lang of ['ar', 'en'] as const) {
      const { rows, pages, marks } = VERSUS_UI[lang]
      expect(Object.keys(pages).sort()).toEqual([...VERSUS_SLUGS].sort())
      for (const slug of VERSUS_SLUGS) {
        const page = pages[slug]
        expect(page.them).toHaveLength(rows.length)
        expect(page.url).toMatch(/^https:\/\/[^\s]+$/)
        expect(page.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(page.pickThem.length).toBeGreaterThan(0)
        expect(page.pickUs.length).toBeGreaterThan(0)
        for (const cell of [...page.them, ...rows.map((row) => row.us)]) {
          expect(Object.keys(marks)).toContain(cell.mark)
          expect(cell.text.length).toBeGreaterThan(3)
        }
      }
    }
  })

  it('says the same thing in both languages: the same mark in every cell, the same date and page', () => {
    expect(VERSUS_UI.en.rows.map((row) => row.us.mark)).toEqual(
      VERSUS_UI.ar.rows.map((row) => row.us.mark),
    )
    for (const slug of VERSUS_SLUGS) {
      const ar = VERSUS_UI.ar.pages[slug]
      const en = VERSUS_UI.en.pages[slug]
      expect(en.them.map((cell) => cell.mark)).toEqual(ar.them.map((cell) => cell.mark))
      expect(en.checked).toBe(ar.checked)
      expect(en.url).toBe(ar.url)
      expect(en.name).toBe(ar.name)
      expect(en.pickThem).toHaveLength(ar.pickThem.length)
      expect(en.pickUs).toHaveLength(ar.pickUs.length)
    }
  })

  it('never says “No” for what a competitor’s page is silent about', () => {
    // A silent page is “not stated”; a “No” needs a statement or a fact of the tool's design.
    const nos = VERSUS_SLUGS.flatMap((slug) =>
      VERSUS_UI.en.pages[slug].them.filter((cell) => cell.mark === 'no').map((cell) => cell.text),
    )
    for (const text of nos) expect(text).not.toMatch(/not stated|does not mention|does not say/i)
  })
})
