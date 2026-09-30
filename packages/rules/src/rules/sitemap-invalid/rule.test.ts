import type { SitemapCheck, SitemapContent, SitemapFacts } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const ORIGIN = 'https://shop.example'
const SITEMAP = `${ORIGIN}/sitemap.xml`
const NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9'
const page = htmlPage('<p>حلوى عمانية</p>', { url: `${ORIGIN}/` })
const robots = {
  outcome: 'fetched',
  url: `${ORIGIN}/robots.txt`,
  status: 200,
  robots: { groups: [], sitemaps: [] },
  truncated: false,
} as const

type Fetched = Extract<SitemapCheck, { outcome: 'fetched' }>
const fetched = (content: SitemapContent, check: Partial<Fetched> = {}): SitemapCheck => ({
  outcome: 'fetched',
  url: SITEMAP,
  named: true,
  status: 200,
  content,
  truncated: false,
  ...check,
})
const named = (...checks: SitemapCheck[]): SitemapFacts => ({
  named: checks.map((check, index) => ({ value: check.url, line: index + 1 })),
  checked: checks,
  unchecked: 0,
})
const evidence = (sitemap: SitemapFacts) => ({ page, robots, sitemap })
const findings = (sitemap: SitemapFacts) => detectAll(rule, evidence(sitemap))

describe('sitemap-invalid', () => {
  it('fires on a sitemap outside the protocol’s namespace', async () => {
    const wrong = await fixtureEvidence(rule.id, 'wrong')
    expect(applies(rule, wrong)).toBe(true)
    expect(detectAll(rule, wrong)).toEqual([
      {
        message: 'namespace',
        url: SITEMAP,
        values: {
          url: SITEMAP,
          root: 'urlset',
          namespace: 'https://www.sitemaps.org/schemas/sitemap/0.9',
        },
        key: SITEMAP,
      },
    ])
  })

  it('fires on a Sitemap line that is not a full URL, pointing at the line', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong-relative'))).toEqual([
      {
        message: 'not-url',
        url: `${ORIGIN}/robots.txt`,
        snippet: '/sitemap.xml',
        location: { line: 4 },
        values: { value: '/sitemap.xml', line: 4 },
        key: '4',
      },
    ])
  })

  it('fires on XML that is not well-formed, where its first error is', async () => {
    const url = `${ORIGIN}/sitemap-products.xml`
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong-unescaped'))).toEqual([
      {
        message: 'not-xml',
        url,
        // Where sax finds the error: at the "=" that no entity name may hold.
        location: { line: 7, column: 55 },
        values: { url, line: 7, column: 55 },
        key: url,
      },
    ])
  })

  it.each(['right', 'right-text'])('passes fixture %s', async (name) => {
    const right = await fixtureEvidence(rule.id, name)
    expect(applies(rule, right)).toBe(true)
    expect(detectAll(rule, right)).toEqual([])
  })

  it('fires on a named sitemap that answers an error status, or an HTML page', () => {
    expect(
      findings(
        named(
          { outcome: 'unavailable', url: SITEMAP, named: true, status: 404 },
          fetched({ kind: 'html' }, { url: `${ORIGIN}/sitemap-ar.xml` }),
        ),
      ),
    ).toEqual([
      {
        message: 'unavailable',
        url: SITEMAP,
        values: { url: SITEMAP, status: 404 },
        key: SITEMAP,
      },
      {
        message: 'html',
        url: `${ORIGIN}/sitemap-ar.xml`,
        values: { url: `${ORIGIN}/sitemap-ar.xml` },
        key: `${ORIGIN}/sitemap-ar.xml`,
      },
    ])
  })

  it('leaves /sitemap.xml without a sitemap to sitemap-missing', () => {
    for (const probe of [
      { outcome: 'unavailable', url: SITEMAP, named: false, status: 404 } as const,
      fetched({ kind: 'html' }, { named: false }),
    ]) {
      const sitemap: SitemapFacts = { named: [], checked: [probe], unchecked: 0 }
      expect(applies(rule, evidence(sitemap))).toBe(false)
      expect(findings(sitemap)).toEqual([])
    }
  })

  it('names another root, a text sitemap’s line that is not a URL, and an empty sitemap', () => {
    const at = (path: string) => `${ORIGIN}${path}`
    expect(
      findings(
        named(
          fetched({ kind: 'root', root: 'urlSet', namespace: NAMESPACE }, { url: at('/a.xml') }),
          fetched({ kind: 'text', line: 3 }, { url: at('/b.txt') }),
          fetched({ kind: 'sitemap', format: 'urlset', entries: 0 }, { url: at('/c.xml') }),
          fetched({ kind: 'sitemap', format: 'text', entries: 0 }, { url: at('/d.txt') }),
        ),
      ).map(({ message, values }) => [message, values]),
    ).toEqual([
      ['root', { url: at('/a.xml'), root: 'urlSet', namespace: NAMESPACE }],
      ['text', { url: at('/b.txt'), line: 3 }],
      ['empty', { url: at('/c.xml') }],
      ['empty', { url: at('/d.txt') }],
    ])
  })

  it('passes the formats Google reads, and a sitemap cut before its first entry', () => {
    const sitemaps = [
      { kind: 'sitemap', format: 'urlset', entries: 2 },
      { kind: 'sitemap', format: 'sitemapindex', entries: 1 },
      { kind: 'sitemap', format: 'rss', entries: null },
      { kind: 'sitemap', format: 'atom', entries: null },
      { kind: 'sitemap', format: 'text', entries: 5 },
      { kind: 'sitemap', format: 'urlset', entries: null },
    ] as const
    for (const content of sitemaps) expect(findings(named(fetched(content)))).toEqual([])
  })

  it('fires on a gzip sitemap that will not decompress: Search Console’s compression error', () => {
    expect(findings(named(fetched({ kind: 'compression' })))).toEqual([
      { message: 'compression', url: SITEMAP, values: { url: SITEMAP }, key: SITEMAP },
    ])
  })

  // M2.3c review: one sitemap that could not be checked must not take the others' verdicts with it.
  describe('when a sitemap could not be checked', () => {
    const failed = (url = SITEMAP, named = true): SitemapCheck => ({
      outcome: 'failed',
      url,
      named,
      code: 'timeout',
    })
    const other = `${ORIGIN}/sitemap-ar.xml`
    const couldNotCheck = (sitemap: SitemapFacts) => rule.couldNotCheck?.(evidence(sitemap)) ?? null

    it('judges the sitemaps that were read, and says nothing of the one that was not', () => {
      const sitemap = named(
        failed(),
        fetched({ kind: 'root', root: 'a', namespace: '' }, { url: other }),
      )
      expect(findings(sitemap).map((finding) => finding.message)).toEqual(['root'])
      expect(couldNotCheck(sitemap)).toBeNull()
      const fine = named(
        failed(),
        fetched({ kind: 'sitemap', format: 'urlset', entries: 2 }, { url: other }),
      )
      expect(findings(fine)).toEqual([])
      expect(couldNotCheck(fine)).toBeNull()
    })

    it('could not check when none of the sitemaps robots.txt names could be read', () => {
      const sitemap = named(failed(), failed(other))
      expect(findings(sitemap)).toEqual([])
      expect(couldNotCheck(sitemap)).toBe('sitemap-unchecked')
    })

    it('still judges a sitemap that answered an error status, which is a verdict', () => {
      const sitemap = named(failed(), {
        outcome: 'unavailable',
        url: other,
        named: true,
        status: 404,
      })
      expect(findings(sitemap).map((finding) => finding.message)).toEqual(['unavailable'])
      expect(couldNotCheck(sitemap)).toBeNull()
    })

    it('still reports a Sitemap line that is not a URL: it needs no fetch', () => {
      const sitemap: SitemapFacts = {
        named: [
          { value: SITEMAP, line: 1 },
          { value: '/relative.xml', line: 2 },
        ],
        checked: [failed()],
        unchecked: 0,
      }
      expect(findings(sitemap).map((finding) => [finding.message, finding.location])).toEqual([
        ['not-url', { line: 2 }],
      ])
      expect(couldNotCheck(sitemap)).toBeNull()
    })

    it('leaves /sitemap.xml unchecked to sitemap-missing, as it leaves it without a sitemap', () => {
      const sitemap: SitemapFacts = { named: [], checked: [failed(SITEMAP, false)], unchecked: 0 }
      expect(applies(rule, evidence(sitemap))).toBe(false)
      expect(couldNotCheck(sitemap)).toBeNull()
    })
  })

  it('applies to public sites with a sitemap to check', () => {
    const local = htmlPage('<p>حلوى</p>', { url: 'http://localhost:4321/' })
    expect(applies(rule, { page: local, sitemap: named(fetched({ kind: 'html' })) })).toBe(false)
    expect(applies(rule, { page })).toBe(false)
    expect(applies(rule, evidence(named(fetched({ kind: 'html' }))))).toBe(true)
  })
})
