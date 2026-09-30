import type { SitemapCheck, SitemapFacts } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const SITEMAP = 'https://shop.example/sitemap.xml'
const page = htmlPage('<p>قهوة عربية</p>', { url: 'https://shop.example/' })
const probe = (check: Partial<SitemapCheck> = {}): SitemapCheck =>
  ({ outcome: 'unavailable', url: SITEMAP, named: false, status: 404, ...check }) as SitemapCheck
const evidence = (sitemap: SitemapFacts) => ({ page, sitemap })

describe('sitemap-missing', () => {
  it('fires when robots.txt names no sitemap and /sitemap.xml has none', async () => {
    const wrong = await fixtureEvidence(rule.id, 'wrong')
    expect(applies(rule, wrong)).toBe(true)
    expect(detectAll(rule, wrong)).toEqual([
      { message: 'none', url: SITEMAP, values: { url: SITEMAP, status: 404 } },
    ])
  })

  it('fires when /sitemap.xml answers with an HTML page, as a site answering every address does', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong-html'))).toEqual([
      { message: 'html', url: SITEMAP, values: { url: SITEMAP } },
    ])
  })

  it.each(['right', 'right-unnamed'])('passes fixture %s', async (name) => {
    const right = await fixtureEvidence(rule.id, name)
    expect(applies(rule, right)).toBe(true)
    expect(detectAll(rule, right)).toEqual([])
  })

  it('counts a sitemap robots.txt names as a full URL, whatever it answers', () => {
    // Whether it can be read is sitemap-invalid's to say.
    const named: SitemapFacts = {
      named: [{ value: 'https://shop.example/sitemap_index.xml', line: 3 }],
      checked: [probe({ url: 'https://shop.example/sitemap_index.xml', named: true, status: 404 })],
      unchecked: 0,
    }
    expect(detectAll(rule, evidence(named))).toEqual([])
  })

  it('reads a Sitemap line that is not a full URL as naming none, as Google does', () => {
    const relative: SitemapFacts = {
      named: [{ value: '/sitemap.xml', line: 1 }],
      checked: [probe({ status: 410 })],
      unchecked: 0,
    }
    expect(detectAll(rule, evidence(relative))).toEqual([
      { message: 'none', url: SITEMAP, values: { url: SITEMAP, status: 410 } },
    ])
  })

  it('takes a sitemap at /sitemap.xml in any format, and leaves what it holds to sitemap-invalid', () => {
    for (const content of [
      { kind: 'sitemap', format: 'text', entries: 0 },
      { kind: 'not-xml', line: 1, column: 1 },
    ] as const) {
      const found: SitemapFacts = {
        named: [],
        checked: [
          {
            outcome: 'fetched',
            url: SITEMAP,
            named: false,
            status: 200,
            content,
            truncated: false,
          },
        ],
        unchecked: 0,
      }
      expect(detectAll(rule, evidence(found))).toEqual([])
    }
  })

  // M2.3c review: where the one place left to look could not be looked at, the site is not
  // called sitemap-less, and not called fine either.
  it('could not check when robots.txt names none and /sitemap.xml could not be read', () => {
    const failed: SitemapCheck = { outcome: 'failed', url: SITEMAP, named: false, code: 'timeout' }
    const unread: SitemapFacts = { named: [], checked: [failed], unchecked: 0 }
    expect(detectAll(rule, evidence(unread))).toEqual([])
    expect(rule.couldNotCheck?.(evidence(unread))).toBe('sitemap-unchecked')
    // A sitemap robots.txt names answers the question, whether or not it could be read.
    const named: SitemapFacts = {
      named: [{ value: 'https://shop.example/s.xml', line: 1 }],
      checked: [{ ...failed, url: 'https://shop.example/s.xml', named: true }],
      unchecked: 0,
    }
    expect(rule.couldNotCheck?.(evidence(named))).toBeNull()
    expect(
      rule.couldNotCheck?.(evidence({ named: [], checked: [probe()], unchecked: 0 })),
    ).toBeNull()
  })

  it('applies to public sites alone, which search engines reach', () => {
    const local = htmlPage('<p>قهوة عربية</p>', { url: 'http://localhost:4321/' })
    expect(applies(rule, { page: local })).toBe(false)
    expect(applies(rule, { page })).toBe(true)
  })
})
