import { describe, expect, it } from 'vitest'
import { decodeError, ERRORS } from '../src/index'

const first = (message: string) => decodeError(message)[0]?.id

describe('decodeError', () => {
  it.each([
    ['Crawled - currently not indexed', 'crawled-not-indexed'],
    ['Discovered – currently not indexed', 'discovered-not-indexed'],
    ['Duplicate without user-selected canonical', 'duplicate-no-canonical'],
    ['Duplicate, Google chose different canonical than user', 'duplicate-other-canonical'],
    ['Alternate page with proper canonical tag', 'alternate-canonical'],
    ["Excluded by 'noindex' tag", 'noindex'],
    ['Blocked by robots.txt', 'blocked-robots'],
    ['Indexed, though blocked by robots.txt', 'indexed-blocked-robots'],
    ['Soft 404', 'soft-404'],
    ['Not found (404)', 'not-found'],
    ['Page with redirect', 'redirect'],
    ['Redirect error', 'redirect-error'],
    ['Server error (5xx)', 'server-error'],
    ['Blocked due to access forbidden (403)', 'forbidden'],
    ["Submitted URL marked 'noindex'", 'submitted-problem'],
    ['Submitted URL seems to be a Soft 404', 'submitted-problem'],
    ['Submitted URL not found (404)', 'submitted-problem'],
    ["Couldn't fetch", 'sitemap-fetch'],
    ["Missing field 'price'", 'missing-field'],
    ["Invalid value in field 'priceCurrency'", 'invalid-value'],
    ['Mismatched value (page crawl): price [price]', 'mismatched-price'],
    ['Mismatched value (page crawl): availability [availability]', 'mismatched-availability'],
    ['Missing value [image link]', 'missing-image'],
    ['Invalid value [gtin]', 'gtin'],
    ['Unavailable landing page', 'landing-page'],
    ['LCP issue: longer than 2.5s (mobile)', 'lcp'],
    ['CLS issue: more than 0.1 (desktop)', 'cls'],
    ['INP issue: longer than 200ms (mobile)', 'inp'],
  ])('%s is %s', (message, id) => {
    expect(first(message)).toBe(id)
  })

  it('reads the Arabic interface’s wording, with or without its marks', () => {
    expect(first('تم الزحف – لم تتم الفهرسة حاليًا')).toBe('crawled-not-indexed')
    expect(first('تم الاكتشاف – لم تتم الفهرسة حاليًا')).toBe('discovered-not-indexed')
  })

  it('says nothing for what it does not know, or for an empty message', () => {
    expect(decodeError('')).toEqual([])
    expect(decodeError('   ')).toEqual([])
    expect(decodeError('hello world')).toEqual([])
  })

  it('has every entry in both languages with a way out, and unique ids', () => {
    expect(new Set(ERRORS.map((entry) => entry.id)).size).toBe(ERRORS.length)
    for (const entry of ERRORS) {
      for (const words of [entry.ar, entry.en]) {
        expect(words.name, entry.id).not.toBe('')
        expect(words.means, entry.id).not.toBe('')
        expect(words.fix.length, entry.id).toBeGreaterThan(0)
      }
      expect(entry.match.length, entry.id).toBeGreaterThan(0)
    }
  })
})
