import type { CrawlPageRow } from '@arablyzer/store'
import { describe, expect, it } from 'vitest'
import { bucketOf, normalizeUrl, shapeOf } from '../src/crawl/url'
import { groupTemplates, kindOf, patternsOf } from '../src/crawl/templates'

const ORIGIN = 'https://shop.example'

describe('normalizeUrl', () => {
  it('keeps pages of the origin, one address for one page', () => {
    expect(normalizeUrl(`${ORIGIN}/a#top`, ORIGIN)).toBe(`${ORIGIN}/a`)
    expect(normalizeUrl(`${ORIGIN}//a///b?b=2&a=1&utm_source=x&fbclid=y`, ORIGIN)).toBe(
      `${ORIGIN}/a/b?a=1&b=2`,
    )
    expect(normalizeUrl(`${ORIGIN}/a?utm_campaign=z`, ORIGIN)).toBe(`${ORIGIN}/a`)
  })
  it('drops other origins, files that are not pages, and addresses with credentials', () => {
    expect(normalizeUrl('https://other.example/a', ORIGIN)).toBeNull()
    expect(normalizeUrl('http://shop.example/a', ORIGIN)).toBeNull()
    expect(normalizeUrl(`${ORIGIN}/brochure.PDF`, ORIGIN)).toBeNull()
    expect(normalizeUrl('https://u:p@shop.example/a', ORIGIN)).toBeNull()
    expect(normalizeUrl('not a url', ORIGIN)).toBeNull()
  })
})

describe('shapes and buckets', () => {
  it('tells numbers, ids, dates and slugs from plain words', () => {
    expect(shapeOf('products')).toBe('products')
    expect(shapeOf('Products')).toBe('products')
    expect(shapeOf('12345')).toBe(':num')
    expect(shapeOf('2026-10')).toBe(':date')
    expect(shapeOf('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(':id')
    expect(shapeOf('nike-air-max-90')).toBe(':slug')
    expect(shapeOf('%D9%85%D9%86%D8%AA%D8%AC')).toBe('منتج')
    expect(shapeOf('%D8%B9%D8%B7%D8%B1-%D8%B9%D9%88%D8%AF')).toBe(':slug')
    expect(shapeOf('%D9%85%D9%86%D8%AA%D8%AC%D8%A7%D8%AA')).toBe('منتجات')
  })
  it('puts pages of one kind in one bucket', () => {
    expect(bucketOf(`${ORIGIN}/`)).toBe('/')
    expect(bucketOf(`${ORIGIN}/about`)).toBe('/:leaf')
    expect(bucketOf(`${ORIGIN}/products/nike-air-max-90`)).toBe('/products/:leaf')
    expect(bucketOf(`${ORIGIN}/products/12?color=red`)).toBe('/products/:leaf')
    expect(bucketOf(`${ORIGIN}/blog/2026-10/some-long-post-title`)).toBe('/blog/:date/:leaf')
  })
})

describe('kindOf', () => {
  it('names a template from the words of its pattern, in both languages', () => {
    expect(kindOf('/')).toBe('home')
    expect(kindOf('/products/:slug')).toBe('product')
    expect(kindOf('/blog/:slug')).toBe('article')
    expect(kindOf('/المدونة/:slug')).toBe('article')
    expect(kindOf('/صفحات/:slug')).toBe('generic')
    expect(kindOf('/مقالات/:slug')).toBe('article')
    expect(kindOf('/category/:slug')).toBe('category')
    expect(kindOf('/help/:slug')).toBe('help')
    expect(kindOf('/:slug')).toBe('generic')
  })
})

const ARTICLE = 'main main>article main>article>h1 main>article>h2 aside footer header'
const PRODUCT = 'main main>section main>section>form main>section>ul main>table footer header'
const LIST = 'main main>section main>section>ul footer header'

function row(
  path: string,
  skeleton: string | null,
  extra: Partial<CrawlPageRow> = {},
): CrawlPageRow {
  return {
    url: `${ORIGIN}${path}`,
    depth: path.split('/').length - 1,
    bucket: bucketOf(`${ORIGIN}${path}`),
    state: skeleton === null ? 'found' : 'checked',
    status: skeleton === null ? null : 200,
    template: null,
    title: null,
    skeleton,
    issues: [],
    renderIssues: [],
    scanId: null,
    error: null,
    ...extra,
  }
}

describe('patternsOf', () => {
  it('collapses a list of pages of one kind and keeps sections apart', () => {
    const urls = [
      ...['a', 'b', 'c', 'd', 'e', 'f'].map((x) => `${ORIGIN}/products/${x}`),
      `${ORIGIN}/blog/2026-10-01`,
      `${ORIGIN}/about`,
      `${ORIGIN}/`,
    ]
    const patterns = patternsOf(urls)
    expect(patterns.get(`${ORIGIN}/products/c`)).toBe('/products/:slug')
    expect(patterns.get(`${ORIGIN}/blog/2026-10-01`)).toBe('/blog/:date')
    expect(patterns.get(`${ORIGIN}/about`)).toBe('/about')
    expect(patterns.get(`${ORIGIN}/`)).toBe('/')
  })
})

describe('groupTemplates', () => {
  const rows = [
    row('/', LIST, { depth: 0 }),
    ...[1, 2, 3, 4, 5, 6].map((n) => row(`/products/item-${n}`, PRODUCT)),
    ...['alpha', 'beta', 'gamma', 'delta', 'omega'].map((n) => row(`/products/${n}`, PRODUCT)),
    ...[1, 2, 3].map((n) => row(`/blog/2026-0${n}-01`, ARTICLE)),
    row('/blog/2026-04-01', null),
    row('/about', LIST),
    row('/contact', LIST),
  ]

  it('makes the home page its own template, then the biggest first, named from the address', () => {
    const { templates, assignments } = groupTemplates(rows, { representatives: 1, rendered: 10 })
    expect(templates.map((t) => [t.key, t.kind, t.pattern, t.found, t.checked])).toEqual([
      ['t1', 'home', '/', 1, 1],
      ['t2', 'product', '/products/:slug', 11, 11],
      ['t3', 'article', '/blog/:date', 4, 3],
      ['t4', 'standalone', '*', 2, 2],
    ])
    expect(assignments.get(`${ORIGIN}/products/alpha`)).toBe('t2')
    expect(assignments.get(`${ORIGIN}/blog/2026-04-01`)).toBe('t3')
    expect(assignments.get(`${ORIGIN}/about`)).toBe('t4')
  })

  it('picks the shallowest page of the main skeleton as the representative, up to the limits', () => {
    const grouped = groupTemplates(rows, { representatives: 1, rendered: 2 })
    expect(grouped.templates.map((t) => t.representatives)).toEqual([
      [`${ORIGIN}/`],
      [`${ORIGIN}/products/alpha`],
      [],
      [],
    ])
    const two = groupTemplates(rows, { representatives: 2, rendered: 10 })
    expect(two.templates[2]?.representatives).toHaveLength(2)
  })

  it('splits a pattern whose pages are built in two ways, and folds a stray into the main one', () => {
    const mixed = [
      ...[1, 2, 3, 4].map((n) => row(`/p/item-${n}`, PRODUCT)),
      ...[5, 6, 7, 8].map((n) => row(`/p/item-${n}`, ARTICLE)),
      row('/p/item-9', `${PRODUCT} main>dl`),
    ]
    const { templates, assignments } = groupTemplates(mixed, { representatives: 1, rendered: 10 })
    expect(templates.map((t) => [t.pattern, t.found])).toEqual([
      ['/p/:slug#1', 5],
      ['/p/:slug#2', 4],
    ])
    expect(assignments.get(`${ORIGIN}/p/item-9`)).toBe('t1')
  })

  it('is the same for the same pages', () => {
    expect(groupTemplates(rows, { representatives: 1, rendered: 5 })).toEqual(
      groupTemplates([...rows], { representatives: 1, rendered: 5 }),
    )
  })
})
