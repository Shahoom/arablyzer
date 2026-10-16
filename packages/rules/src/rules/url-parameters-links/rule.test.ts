import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const page = (links: string, url = 'https://shop.example/offers', head = '') =>
  htmlPage(`<html lang="ar"><head>${head}</head><body>${links}</body></html>`, { url })
const found = (links: string, url?: string, head?: string) =>
  detectAll(rule, evidenceOf(page(links, url, head))).map((finding) => [
    finding.message,
    finding.values?.param ?? finding.values?.params,
    finding.values?.count,
  ])

describe('url-parameters-links', () => {
  it('fails the wrong fixture: tracking parameters twice and a session id once', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(
      detectAll(rule, evidence).map((finding) => [
        finding.message,
        finding.values?.param,
        finding.values?.count,
      ]),
    ).toEqual([
      ['tracking', 'utm_source', 2],
      ['tracking', 'utm_medium', 2],
      ['session', 'phpsessid', 1],
    ])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('judges links to the page’s own site only, www aside', () => {
    expect(found('<a href="https://www.shop.example/p?utm_source=x">x</a>')).toEqual([
      ['tracking', 'utm_source', 1],
    ])
    expect(found('<a href="https://other.example/p?utm_source=x">x</a>')).toEqual([])
    expect(
      found('<a href="https://shop.example/p?fbclid=1">x</a><a href="/q?fbclid=2">y</a>'),
    ).toEqual([['tracking', 'fbclid', 2]])
  })

  it.each([['gclid'], ['msclkid'], ['utm_campaign'], ['UTM_Source'], ['mc_cid'], ['_ga']])(
    '%s is a tracking parameter',
    (name) => {
      expect(found(`<a href="/p?${name}=1">x</a>`)[0]?.[0]).toBe('tracking')
    },
  )

  it.each([['sid'], ['PHPSESSID'], ['jsessionid'], ['session_id']])(
    '%s is a session parameter',
    (name) => {
      expect(found(`<a href="/p?${name}=1">x</a>`)[0]?.[0]).toBe('session')
    },
  )

  it.each([['sort'], ['page'], ['q'], ['color'], ['ref'], ['utm']])(
    '%s is a parameter of the page',
    (name) => {
      expect(found(`<a href="/p?${name}=1">x</a>`)).toEqual([])
    },
  )

  it('says when the page itself was fetched with tracking and keeps or lacks a canonical', () => {
    const link = '<a href="/">x</a>'
    expect(found(link, 'https://shop.example/offers?utm_source=a')).toEqual([
      ['own-url', 'utm_source', undefined],
    ])
    expect(
      found(
        link,
        'https://shop.example/offers?utm_source=a',
        '<link rel="canonical" href="https://shop.example/offers">',
      ),
    ).toEqual([])
    expect(
      found(
        link,
        'https://shop.example/offers?utm_source=a',
        '<link rel="canonical" href="https://shop.example/offers?utm_source=a">',
      ),
    ).toEqual([['own-url', 'utm_source', undefined]])
    expect(found(link, 'https://shop.example/offers?sort=price')).toEqual([])
  })

  it('does not apply to a page without links', () => {
    expect(rule.appliesTo(page('<p>x</p>'))).toBe(false)
  })
})
