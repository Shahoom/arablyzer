import { describe, expect, it } from 'vitest'
import { parseLinkHeader } from '../src/link-header'

const BASE = 'https://example.com/ar/page'

describe('parseLinkHeader (RFC 8288)', () => {
  it('reads target, rel and hreflang', () => {
    expect(
      parseLinkHeader('<https://example.com/en/>; rel="alternate"; hreflang="en-GB"', BASE),
    ).toEqual([
      {
        target: 'https://example.com/en/',
        url: 'https://example.com/en/',
        rel: ['alternate'],
        hreflang: 'en-GB',
        raw: '<https://example.com/en/>; rel="alternate"; hreflang="en-GB"',
      },
    ])
  })

  it('splits entries on commas, but not inside <…> or quoted strings', () => {
    const entries = parseLinkHeader(
      '<https://example.com/a,b>; rel=canonical, <https://example.com/x>; title="a, \\"b\\""; rel="alternate"',
      BASE,
    )
    expect(entries.map((entry) => [entry.url, entry.rel])).toEqual([
      ['https://example.com/a,b', ['canonical']],
      ['https://example.com/x', ['alternate']],
    ])
  })

  it('resolves relative targets against the response URL', () => {
    expect(parseLinkHeader('</en/page>; rel=canonical', BASE)[0]?.url).toBe(
      'https://example.com/en/page',
    )
  })

  it('lowercases rel values and parameter names, and splits rel lists', () => {
    expect(parseLinkHeader('<x>; REL="Canonical Alternate"', BASE)[0]?.rel).toEqual([
      'canonical',
      'alternate',
    ])
  })

  it('uses only the first rel parameter', () => {
    expect(parseLinkHeader('<x>; rel=canonical; rel=alternate', BASE)[0]?.rel).toEqual([
      'canonical',
    ])
  })

  it('tolerates spaces around separators and empty list elements', () => {
    const entries = parseLinkHeader(' , <a> ;rel = canonical ,, <b>;rel=next ', BASE)
    expect(entries.map((entry) => entry.rel)).toEqual([['canonical'], ['next']])
  })

  it('skips malformed entries without a <target>', () => {
    const entries = parseLinkHeader(
      'https://example.com/; rel=canonical, <ok>; rel=canonical',
      BASE,
    )
    expect(entries.map((entry) => entry.target)).toEqual(['ok'])
  })

  it('keeps an entry whose target cannot be resolved, with url null', () => {
    expect(parseLinkHeader('<http://[::1>; rel=canonical', BASE)[0]?.url).toBeNull()
  })

  it('returns an empty list for an empty header', () => {
    expect(parseLinkHeader('', BASE)).toEqual([])
  })
})
