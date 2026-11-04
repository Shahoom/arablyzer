import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const page = (body: string, url = 'https://shop.example/page') =>
  htmlPage(`<html lang="ar"><body>${body}</body></html>`, { url })
const sites = (body: string, url?: string) =>
  detectAll(rule, evidenceOf(page(body, url))).map((finding) => [
    finding.values?.site,
    finding.values?.count,
    finding.values?.followed,
    finding.values?.nofollow,
    finding.values?.sponsored,
    finding.values?.ugc,
  ])

describe('outbound-links-found', () => {
  it('reports on the wrong fixture: two sites, one with a sponsored link', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(
      detectAll(rule, evidence).map((finding) => [finding.values?.site, finding.values?.count]),
    ).toEqual([
      ['example.org', 2],
      ['example.net', 1],
    ])
  })

  it('has nothing to report on the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('counts each site’s links by how they are marked', () => {
    expect(
      sites(
        '<a href="https://a.example/1">x</a><a href="https://www.a.example/2" rel="nofollow">x</a><a href="https://a.example/3" rel="UGC Nofollow">x</a><a href="https://b.example/" rel="sponsored">x</a>',
      ),
    ).toEqual([
      ['a.example', 3, 1, 2, 0, 1],
      ['b.example', 1, 0, 0, 1, 0],
    ])
  })

  it('leaves the page’s own site, its subdomains, and links that are not web addresses', () => {
    expect(
      sites(
        '<a href="/x">x</a><a href="https://shop.example/y">x</a><a href="https://blog.shop.example/z">x</a><a href="mailto:a@b.example">x</a><a href="tel:+968">x</a><a href="javascript:void(0)">x</a><a href="#top">x</a>',
      ),
    ).toEqual([])
  })

  it('does not apply to a page with no links', () => {
    expect(rule.appliesTo(page('<p>x</p>'))).toBe(false)
  })
})
