import type { LinkCheck } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

/** A page with these links, and how each check ended. */
const checked = (html: string, ...checks: LinkCheck[]) => ({
  page: htmlPage(html, { url: 'https://shop.example/ar/' }),
  links: { total: checks.length, checks, skipped: { limit: 0, robots: 0 } },
})

describe('link-broken', () => {
  it('fires on a link to the site that answers 404', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(detectAll(rule, evidence)).toEqual([
      {
        message: 'broken',
        values: { url: 'http://fixture.test/ar/ofers/', status: 404 },
        selector: 'body > nav > a:nth-of-type(2)',
        snippet: '<a href="/ar/ofers/">',
        location: { line: 17, column: 7 },
        key: 'http://fixture.test/ar/ofers/',
      },
    ])
  })

  it('fires on a link to the site that answers a server error', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong-error'))).toMatchObject([
      { message: 'broken', values: { url: 'http://fixture.test/ar/cart/', status: 500 } },
    ])
  })

  it('passes links that answer, a redirect among them, and one whose server refuses HEAD', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(evidence.links?.checks).toEqual([
      { url: 'http://fixture.test/ar/about/', outcome: 'answered', status: 200, method: 'HEAD' },
      { url: 'http://fixture.test/ar/offers/', outcome: 'answered', status: 200, method: 'HEAD' },
      { url: 'http://fixture.test/ar/sale/', outcome: 'answered', status: 301, method: 'HEAD' },
      { url: 'http://fixture.test/ar/catalog/', outcome: 'answered', status: 200, method: 'GET' },
    ])
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('reports an address once, at its first link, and judges only the answers', () => {
    const findings = detectAll(
      rule,
      checked(
        '<a href="/ar/gone/">أ</a><a href="/ar/gone/#more">ب</a><a href="/ar/busy/">ج</a><a href="/ar/slow/">د</a>',
        { url: 'https://shop.example/ar/gone/', outcome: 'answered', status: 410, method: 'GET' },
        { url: 'https://shop.example/ar/busy/', outcome: 'unanswered', reason: 'rate-limited' },
        { url: 'https://shop.example/ar/slow/', outcome: 'unanswered', reason: 'timeout' },
      ),
    )
    expect(findings).toMatchObject([
      {
        values: { url: 'https://shop.example/ar/gone/', status: 410 },
        selector: 'body > a:nth-of-type(1)',
      },
    ])
  })

  it('does not apply to a page without links to its own site', () => {
    expect(applies(rule, checked('<a href="https://elsewhere.example/">خارج</a>'))).toBe(false)
    expect(applies(rule, { page: htmlPage('<a href="/x">x</a>') })).toBe(false)
  })
})
