import { describe, expect, it } from 'vitest'
import {
  collectPage,
  compareProbe,
  findSearch,
  lossOf,
  pickNumbers,
  pickWords,
  planQueries,
  searchUrl,
  variantsOf,
  type PageFacts,
  type SearchProbe,
} from '../src'

const page = (body: string, url = 'https://shop.example/', lang = 'ar'): PageFacts =>
  collectPage({
    url,
    status: 200,
    headers: [['content-type', 'text/html; charset=utf-8']],
    body: new TextEncoder().encode(
      `<!doctype html><html lang="${lang}"><head><title>متجر</title></head><body>${body}</body></html>`,
    ),
    certificate: null,
  })

describe('findSearch', () => {
  it('reads a form marked as a search, with its field and action', () => {
    const found = findSearch(
      page('<form role="search" action="/find"><input type="search" name="term"></form>'),
      null,
    )
    expect(found).toEqual({ via: 'form', url: 'https://shop.example/find', param: 'term' })
  })

  it('reads a search field named like a query, and keeps the action’s own parameters', () => {
    const found = findSearch(
      page('<form action="/?post_type=product"><input type="text" name="s"></form>'),
      null,
    )
    expect(found).toMatchObject({ via: 'form', param: 's' })
    expect(found && searchUrl(found, 'قهوة')).toBe(
      'https://shop.example/?post_type=product&s=%D9%82%D9%87%D9%88%D8%A9',
    )
  })

  it('leaves out a POST form, and a form on another site', () => {
    expect(
      findSearch(page('<form method="post"><input type="search" name="q"></form>'), null),
    ).toBeNull()
    expect(
      findSearch(
        page('<form action="https://other.example/s"><input type="search" name="q"></form>'),
        null,
      ),
    ).toBeNull()
  })

  it('falls back to the platform’s own search address, which it marks as a pattern', () => {
    expect(findSearch(page('<p>مرحبا</p>'), 'wordpress')).toEqual({
      via: 'wordpress',
      url: 'https://shop.example/',
      param: 's',
    })
    expect(findSearch(page('<p>مرحبا</p>'), 'shopify')).toEqual({
      via: 'platform',
      url: 'https://shop.example/search',
      param: 'q',
    })
    expect(findSearch(page('<p>مرحبا</p>'), 'drupal')).toBeNull()
    expect(findSearch(page('<p>مرحبا</p>'), null)).toBeNull()
  })
})

describe('words and variants', () => {
  const books = page(
    '<h1>مكتبة النور</h1><p>مكتبة الأطفال وكتب القصص. هذه المكتبة فيها ٢٠٢٤ كتابًا وكتابٌ جديد.</p>',
  )

  it('picks real words of the page, headings first, never a function word', () => {
    const words = pickWords(books, 3)
    expect(words[0]).toBe('مكتبة')
    expect(words).not.toContain('هذه')
    expect(words).toHaveLength(3)
    expect(pickWords(books, 3)).toEqual(words)
    expect(pickNumbers(books)).toEqual(['٢٠٢٤'])
  })

  it('makes each variant a different spelling of the same word', () => {
    const kinds = Object.fromEntries(variantsOf('مكتبة').map((v) => [v.kind, v.query]))
    expect(kinds['ta-marbuta']).toBe('مكتبه')
    expect(kinds.tatweel).toBe('مكـتبة')
    expect(kinds.diacritics).toBe('مَكتبة')
    expect(Object.fromEntries(variantsOf('أطفال').map((v) => [v.kind, v.query])).alef).toBe('اطفال')
    expect(Object.fromEntries(variantsOf('مصطفى').map((v) => [v.kind, v.query])).ya).toBe('مصطفي')
    const hamza = Object.fromEntries(variantsOf('الاسلام').map((v) => [v.kind, v.query])).alef
    expect(hamza).toBe('الأسلام')
    // A word with no letter of its own to swap still has a tatweel, a diacritic, a chat spelling.
    expect(variantsOf('كتب').map((v) => v.kind)).toEqual(['tatweel', 'diacritics', 'arabizi'])
  })

  it('plans at most the slots it was given, each word first, then one variant of each in turn', () => {
    const plan = planQueries(['مكتبة', 'أطفال', 'مدرسة'], ['٢٠٢٤'], 11)
    expect(plan.length).toBeLessThanOrEqual(11)
    expect(plan.slice(0, 4).map((q) => q.kind)).toEqual(['base', 'base', 'base', 'base'])
    expect(plan.filter((q) => q.kind === 'arabizi')).toHaveLength(1)
    expect(plan.at(-1)?.kind).toBe('arabizi')
    expect(plan.find((q) => q.kind === 'digits')).toMatchObject({ word: '٢٠٢٤', query: '2024' })
    expect(new Set(plan.map((q) => q.query)).size).toBe(plan.length)
    expect(planQueries(['مكتبة'], [], 2)).toHaveLength(2)
  })
})

describe('judging the answers', () => {
  const probe = (results: number | null, first: string | null = '/a'): SearchProbe => ({
    query: 'q',
    status: 200,
    results,
    first,
  })

  it('calls a variant lost when it finds none, or less than half', () => {
    const base = probe(8)
    expect(compareProbe(base, probe(0, null))).toBe('lost')
    expect(compareProbe(base, probe(3))).toBe('lost')
    expect(compareProbe(base, probe(4))).toBe('differs')
    expect(compareProbe(base, probe(8, '/b'))).toBe('differs')
    expect(compareProbe(base, probe(8))).toBe('same')
    expect(compareProbe(base, probe(null, null))).toBe('unanswered')
    expect(compareProbe(probe(0, null), probe(0, null))).toBe('same')
  })

  it('counts lost variants of the words whose own spelling found something, never an Arabizi form', () => {
    const variant = (kind: 'ya' | 'alef' | 'arabizi', outcome: 'lost' | 'same' | 'unanswered') => ({
      ...probe(0),
      kind,
      counted: kind !== 'arabizi',
      outcome,
    })
    expect(
      lossOf([
        {
          word: 'a',
          base: probe(5),
          variants: [variant('ya', 'lost'), variant('alef', 'same'), variant('arabizi', 'lost')],
        },
        { word: 'b', base: probe(0), variants: [variant('ya', 'lost')] },
        { word: 'c', base: probe(2), variants: [variant('alef', 'unanswered')] },
      ]),
    ).toEqual({ lost: 1, total: 2 })
  })
})
