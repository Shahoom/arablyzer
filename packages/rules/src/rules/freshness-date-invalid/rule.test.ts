import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { isoDay, rule } from './rule'

const page = (head: string, headers: [string, string][] = []) =>
  htmlPage(`<html lang="ar"><head>${head}</head><body><p>x</p></body></html>`, {
    headers: [['content-type', 'text/html'], ...headers],
  })
const meta = (property: string, content: string) =>
  `<meta property="${property}" content="${content}">`
const found = (head: string, headers: [string, string][] = []) =>
  detectAll(rule, evidenceOf(page(head, headers))).map((finding) => finding.message)

describe('freshness-date-invalid', () => {
  it('fails the wrong fixture: Arabic digits, a prose date, a modification before the publication, a bad header', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence).map((finding) => finding.message)).toEqual([
      'not-iso',
      'not-iso',
      'modified-before-published',
      'header-invalid',
    ])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it.each([
    ['2026-10-11', 20261011],
    ['2026-10-11T08:00:00Z', 20261011],
    ['2026-10-11T08:00:00+03:00', 20261011],
    ['2026-10-11 08:00', 20261011],
    ['2026-10-11T08:00:00.123+0300', 20261011],
    ['2028-02-29', 20280229],
    ['2026-02-29', null],
    ['2026-13-01', null],
    ['2026-10-32', null],
    ['2026-10-11T25:00', null],
    ['٢٠٢٦-١٠-١١', null],
    ['11/10/2026', null],
    ['11 أكتوبر 2026', null],
    ['2026-10', null],
    ['', null],
  ])('%j is %s', (value, day) => {
    expect(isoDay(value)).toBe(day)
  })

  it('reads the meta dates and the JSON-LD dates of a page', () => {
    const ld = (body: object) =>
      `<script type="application/ld+json">${JSON.stringify(body)}</script>`
    expect(
      found(ld({ '@type': 'Article', datePublished: '2026-03-05', dateModified: '2026-04-01' })),
    ).toEqual([])
    expect(found(ld({ '@type': 'Article', datePublished: '٢٠٢٦-٠٣-٠٥' }))).toEqual(['not-iso'])
    expect(
      found(
        ld({ '@type': 'Product', offers: { '@type': 'Offer', priceValidUntil: '31/12/2026' } }),
      ),
    ).toEqual(['not-iso'])
    expect(
      found(ld({ '@type': 'Article', datePublished: '2026-05-01', dateModified: '2026-04-01' })),
    ).toEqual(['modified-before-published'])
  })

  it('compares the last modification with the first publication, across meta and JSON-LD', () => {
    expect(
      found(
        meta('article:published_time', '2026-03-05') + meta('article:modified_time', '2026-03-05'),
      ),
    ).toEqual([])
    expect(
      found(
        meta('article:published_time', '2026-03-05') + meta('article:modified_time', '2026-03-04'),
      ),
    ).toEqual(['modified-before-published'])
  })

  it('judges the Last-Modified header as an HTTP date', () => {
    expect(found('', [['last-modified', 'Sun, 11 Oct 2026 08:00:00 GMT']])).toEqual([])
    expect(found('', [['last-modified', '2026-10-11']])).toEqual(['header-invalid'])
    expect(found('', [['last-modified', 'Sunday, 11-Oct-26 08:00:00 GMT']])).toEqual([
      'header-invalid',
    ])
  })

  it('does not judge how old a date is', () => {
    expect(
      found(
        meta('article:published_time', '1999-01-01') + meta('article:modified_time', '2099-12-31'),
      ),
    ).toEqual([])
  })

  it('does not apply to a page that states no date', () => {
    expect(rule.appliesTo(page('<title>x</title>'))).toBe(false)
  })
})
