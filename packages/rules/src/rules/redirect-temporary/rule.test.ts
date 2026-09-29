import type { Redirect } from '@arablyzer/report-schema'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const reached = (url: string, ...redirects: Redirect[]) => ({
  page: htmlPage('<p>نص</p>', { url }),
  redirects,
})
/** The findings for one redirect of `status` from `from` to the page at `to`. */
const moved = (status: number, from: string, to: string) =>
  detectAll(rule, reached(to, { url: from, status }))

describe('redirect-temporary', () => {
  it('fires on a 302 from a name to its www', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong'))).toEqual([
      {
        message: 'temporary',
        values: { status: 302, from: 'https://shop.example/', to: 'https://www.shop.example/' },
        url: 'https://shop.example/',
        snippet: '302 https://shop.example/ → https://www.shop.example/',
      },
    ])
  })

  it('passes the same move made for good, and a temporary move to a language', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right-language'))).toEqual([])
  })

  it('flags 302, 303 and 307 to HTTPS, between a name and its www, or both', () => {
    const forGood: [string, string][] = [
      ['http://example.com/', 'https://example.com/'],
      ['https://www.example.com/p?q=1', 'https://example.com/p?q=1'],
      ['http://example.com/', 'https://www.example.com/'],
      ['http://example.com:8443/shop', 'https://example.com:8443/shop'],
    ]
    for (const [from, to] of forGood) {
      // Google lists 302, 303 and 307 together as temporary, and a scan only sends GET.
      for (const status of [302, 303, 307]) {
        expect(moved(status, from, to), `${String(status)} ${from}`).toMatchObject([
          { message: 'temporary', values: { status, from, to } },
        ])
      }
      for (const status of [301, 308]) {
        expect(moved(status, from, to), `${String(status)} ${from}`).toEqual([])
      }
    }
  })

  it('leaves alone temporary moves that may be meant', () => {
    const meant: [string, string][] = [
      // Another path, another query, another name, another port, back to HTTP.
      ['http://example.com/', 'https://example.com/ar/'],
      ['https://example.com/?lang=ar', 'https://www.example.com/?lang=en'],
      ['https://example.com/', 'https://shop.example.com/'],
      ['http://example.com:8080/', 'https://example.com:8443/'],
      ['https://example.com/', 'http://example.com/'],
      ['https://example.com/', 'https://example.com/'],
    ]
    for (const [from, to] of meant) expect(moved(302, from, to), from).toEqual([])
  })

  it('judges each redirect of a chain by the address it leads to', () => {
    const findings = detectAll(
      rule,
      reached(
        'https://www.example.com/',
        { url: 'http://example.com/', status: 301 },
        { url: 'https://example.com/', status: 307 },
      ),
    )
    expect(findings).toEqual([
      {
        message: 'temporary',
        values: { status: 307, from: 'https://example.com/', to: 'https://www.example.com/' },
        url: 'https://example.com/',
        snippet: '307 https://example.com/ → https://www.example.com/',
      },
    ])
  })

  it('does not apply to a page that answered at once', () => {
    expect(applies(rule, reached('https://example.com/'))).toBe(false)
  })
})
