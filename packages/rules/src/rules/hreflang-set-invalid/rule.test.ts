import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const page = (links: string, url = 'https://shop.example/sa/offers', canonical = '') =>
  htmlPage(`<html lang="ar"><head>${canonical}${links}</head><body><p>x</p></body></html>`, { url })
const alt = (code: string, href: string) =>
  `<link rel="alternate" hreflang="${code}" href="${href}">`
const messages = (...args: Parameters<typeof page>) =>
  detectAll(rule, evidenceOf(page(...args))).map((finding) => finding.message)

describe('hreflang-set-invalid', () => {
  it('fails the wrong fixture: a relative address, no entry for the page, a language twice', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence).map((finding) => finding.message)).toEqual([
      'relative-url',
      'self-missing',
      'duplicate-code',
    ])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('finds the page by its address, whatever its query, fragment, case and trailing slash', () => {
    const links =
      alt('ar-SA', 'HTTPS://Shop.Example/sa/offers/') +
      alt('ar-AE', 'https://shop.example/ae/offers')
    expect(messages(links, 'https://shop.example/sa/offers?utm_source=x#top')).toEqual([])
  })

  it('finds the page by its canonical address when it has one', () => {
    const links =
      alt('ar-SA', 'https://shop.example/sa/offers') +
      alt('ar-AE', 'https://shop.example/ae/offers')
    const canonical = '<link rel="canonical" href="https://shop.example/sa/offers">'
    expect(messages(links, 'https://shop.example/sa/offers?page=2', canonical)).toEqual([])
    expect(
      messages(
        links,
        'https://shop.example/ae/offers',
        '<link rel="canonical" href="https://shop.example/ae/other">',
      ),
    ).toEqual(['self-missing'])
  })

  it('does not judge a page none of whose links is on its host: it cannot tell which one it is', () => {
    const links =
      alt('ar-SA', 'https://shop.example/sa/offers') +
      alt('ar-AE', 'https://shop.example/ae/offers')
    expect(messages(links, 'http://127.0.0.1:3000/')).toEqual([])
  })

  it.each([['/sa/offers'], ['//shop.example/sa/offers'], ['sa/offers'], ['']])(
    'calls %j a relative address',
    (href) => {
      const found = detectAll(
        rule,
        evidenceOf(page(alt('ar-SA', href) + alt('ar-AE', 'https://shop.example/ae'))),
      )
      expect(found.some((finding) => finding.message === 'relative-url')).toBe(true)
    },
  )

  it('names a language given two addresses, but not the same address twice', () => {
    const base = alt('ar-SA', 'https://shop.example/sa/offers')
    expect(
      messages(base + alt('en', 'https://shop.example/en') + alt('EN', 'https://shop.example/en2')),
    ).toEqual(['duplicate-code'])
    expect(
      messages(base + alt('en', 'https://shop.example/en') + alt('en', 'https://shop.example/en/')),
    ).toEqual([])
  })

  it('points at the link', () => {
    const [finding] = detectAll(
      rule,
      evidenceOf(page(alt('ar-SA', '/sa/offers') + alt('ar-AE', 'https://shop.example/ae/offers'))),
    )
    expect(finding).toMatchObject({
      message: 'relative-url',
      values: { hreflang: 'ar-SA', href: '/sa/offers' },
      selector: 'head > link:nth-of-type(1)',
    })
  })

  it('does not apply to a page without hreflang links', () => {
    expect(rule.appliesTo(page(''))).toBe(false)
    expect(rule.appliesTo(page('<link rel="alternate" href="https://x.example/feed">'))).toBe(false)
  })
})
