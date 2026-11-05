import type { SitemapFacts, SitemapUrl } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const ORIGIN = 'https://shop.example'
const page = htmlPage('<p>حلوى عمانية</p>', { url: `${ORIGIN}/` })
const robots = {
  outcome: 'fetched',
  url: `${ORIGIN}/robots.txt`,
  status: 200,
  robots: { groups: [], sitemaps: [] },
  truncated: false,
} as const
const entry = (n: number, lastmod: string | null): SitemapUrl => ({
  loc: `${ORIGIN}/p${String(n)}`,
  lastmod,
  alternates: [],
})
const evidence = (urls: SitemapUrl[]) => {
  const sitemap: SitemapFacts = {
    named: [{ value: `${ORIGIN}/sitemap.xml`, line: 1 }],
    checked: [
      {
        outcome: 'fetched',
        url: `${ORIGIN}/sitemap.xml`,
        named: true,
        status: 200,
        content: { kind: 'sitemap', format: 'urlset', entries: urls.length },
        truncated: false,
        urls: { urls, total: urls.length },
      },
    ],
    unchecked: 0,
  }
  return { page, robots, sitemap }
}
const found = (urls: SitemapUrl[]) =>
  detectAll(rule, evidence(urls)).map((finding) => [
    finding.message,
    finding.values?.value,
    finding.values?.count,
  ])

describe('sitemap-lastmod-invalid', () => {
  it('fails the wrong fixture: a date written 05/03/2026', async () => {
    const wrong = await fixtureEvidence(rule.id, 'wrong')
    expect(applies(rule, wrong)).toBe(true)
    expect(detectAll(rule, wrong).map((f) => [f.message, f.values?.value])).toEqual([
      ['invalid', '05/03/2026'],
    ])
  })

  it('fails the wrong-identical fixture: ten pages with the day the file was built', async () => {
    const wrong = await fixtureEvidence(rule.id, 'wrong-identical')
    expect(detectAll(rule, wrong).map((f) => [f.message, f.values?.count])).toEqual([
      ['identical', 10],
    ])
  })

  it('passes the right fixture: dates, a date with a time, and an entry with none', async () => {
    const right = await fixtureEvidence(rule.id, 'right')
    expect(applies(rule, right)).toBe(true)
    expect(detectAll(rule, right)).toEqual([])
  })

  it.each([
    ['2026-03-05', true],
    ['2026-03-05T08:30:00Z', true],
    ['2026-03-05T08:30+03:00', true],
    ['2026-03-05T08:30:15.250Z', true],
    ['2026-3-5', false],
    ['05/03/2026', false],
    ['٢٠٢٦-٠٣-٠٥', false],
    ['2026-02-30', false],
    ['2026-13-01', false],
    ['2026-03-05 08:30', false],
    ['2026-03-05T08:30', false],
    ['', false],
  ])('%s is %s', (value, valid) => {
    expect(found([entry(1, value)]).length === 0).toBe(valid)
  })

  it('counts the invalid dates and shows the first', () => {
    expect(found([entry(1, '2026-03-05'), entry(2, 'x'), entry(3, 'y')])).toEqual([
      ['invalid', 'x', 2],
    ])
  })

  it('says identical only from ten dated entries, and not for entries without a date', () => {
    const same = (n: number) => Array.from({ length: n }, (_, i) => entry(i, '2026-03-05'))
    expect(found(same(9))).toEqual([])
    expect(found(same(10))).toEqual([['identical', '2026-03-05', 10]])
    expect(found([...same(9), entry(99, null)])).toEqual([])
    expect(found([...same(9), entry(99, '2026-03-06')])).toEqual([])
  })

  it('does not apply without a dated entry, or to a site that is not public', () => {
    expect(rule.appliesTo(page, evidence([entry(1, null)]))).toBe(false)
    expect(
      rule.appliesTo(
        htmlPage('<p>x</p>', { url: 'http://localhost/' }),
        evidence([entry(1, '2026-03-05')]),
      ),
    ).toBe(false)
  })
})
