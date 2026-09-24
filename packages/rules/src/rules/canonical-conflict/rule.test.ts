import type { Header } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import {
  detectAll,
  evidenceOf,
  FIXTURE_ORIGIN,
  fixtureEvidence,
  htmlPage,
} from '../../../test/helpers'
import { rule } from './rule'

const HTML: Header = ['content-type', 'text/html; charset=utf-8']
const page = (head: string, links: string[] = []) =>
  htmlPage(`<html lang="ar"><head>${head}</head><body>نص</body></html>`, {
    headers: [HTML, ...links.map((value): Header => ['link', value])],
    url: `${FIXTURE_ORIGIN}/ar/oud`,
  })
const detect = (head: string, links: string[] = []) =>
  detectAll(rule, evidenceOf(page(head, links)))

describe('canonical-conflict', () => {
  it('fires on two canonical tags with different URLs', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([
      {
        message: 'multiple-tags',
        values: {
          canonicals: [
            { source: 'link', href: 'https://example.com/oud', url: 'https://example.com/oud' },
            {
              source: 'link',
              href: 'https://example.com/oud?ref=home',
              url: 'https://example.com/oud?ref=home',
            },
          ],
        },
        selector: 'head > link:nth-of-type(2)',
        snippet: '<link rel="canonical" href="https://example.com/oud?ref=home" />',
        location: { line: 8, column: 5 },
      },
    ])
  })

  it('fires when the Link header disagrees with the tag', async () => {
    const [finding] = detectAll(rule, await fixtureEvidence(rule.id, 'wrong-header'))
    expect(finding).toMatchObject({
      message: 'header-mismatch',
      values: { headerUrl: 'https://example.com/products/oud', tagUrl: 'https://example.com/oud' },
      selector: 'head > link',
    })
  })

  it('passes the right fixture: one canonical, the header agrees', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('compares resolved URLs without fragments', () => {
    expect(
      detect(
        '<link rel="canonical" href="/ar/oud"><link rel="canonical" href="http://fixture.test/ar/oud#top">',
      ),
    ).toEqual([])
    expect(
      detect('<base href="http://fixture.test/ar/"><link rel="canonical" href="oud">', [
        '</ar/oud>; rel=canonical',
      ]),
    ).toEqual([])
    expect(
      detect('<link rel="canonical" href="/ar/oud"><link rel="canonical" href="/ar/oud/">'),
    ).toHaveLength(1)
  })

  it('reports conflicting Link headers on their own', () => {
    const findings = detectAll(
      rule,
      evidenceOf(
        htmlPage('%PDF', {
          headers: [
            ['content-type', 'application/pdf'],
            ['link', '</a.pdf>; rel=canonical, </b.pdf>; rel=canonical'],
          ],
        }),
      ),
    )
    expect(findings.map((finding) => finding.message)).toEqual(['multiple-headers'])
  })

  it('ignores canonical links in <body>, which Google ignores too', () => {
    expect(detect('<link rel="canonical" href="/a">')).toEqual([])
    const bodyLink = htmlPage(
      '<link rel="canonical" href="/a"><p>نص</p><link rel="canonical" href="/b">',
    )
    expect(detectAll(rule, evidenceOf(bodyLink))).toEqual([])
  })

  it('does not apply without a canonical', () => {
    expect(rule.appliesTo(page('<link rel="alternate" hreflang="ar" href="/ar/">'))).toBe(false)
  })
})
