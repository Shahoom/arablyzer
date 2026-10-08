import type { Header } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { confidenceLevel, detectPlatforms } from '../../lib/platforms'
import { rule } from './rule'

const HTML: Header = ['content-type', 'text/html; charset=utf-8']
const page = (head: string, ...headers: Header[]) =>
  htmlPage(`<!doctype html><html lang="ar"><head>${head}</head><body><h1>متجر</h1></body></html>`, {
    url: 'https://shop.example/',
    headers: [HTML, ...headers],
  })
const found = (head: string, ...headers: Header[]) =>
  Object.fromEntries(detectPlatforms(page(head, ...headers)).map((tech) => [tech.name, tech]))

describe('platform-detected', () => {
  it('is information, never deducted', () => {
    expect(rule.severity).toBe('info')
  })

  it('lists what a WordPress page shows, with its version, and what that implies', async () => {
    const findings = detectAll(rule, await fixtureEvidence(rule.id, 'wrong'))
    const wordpress = findings.find((finding) => finding.values?.name === 'WordPress')
    expect(wordpress).toMatchObject({
      message: 'platform',
      values: { version: '6.4.2', versionText: ' 6.4.2', level: 'high' },
      key: 'wordpress',
    })
    expect(findings.find((finding) => finding.values?.name === 'WooCommerce')).toMatchObject({
      values: { version: '8.5.1' },
    })
  })

  it('passes a page that shows no platform, and reads cookies from the headers', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
    const zid = detectAll(rule, await fixtureEvidence(rule.id, 'wrong-zid'))
    expect(zid[0]).toMatchObject({ message: 'platform', values: { name: 'Zid', level: 'high' } })
  })

  it('applies to an HTML page alone', () => {
    expect(applies(rule, evidenceOf(page('')))).toBe(true)
  })
})

describe('the fingerprints', () => {
  it('knows Salla by its header and its CDN, with the header alone sure', () => {
    expect(found('', ['x-powered-by', 'Salla']).Salla?.confidence).toBe(100)
    const cdn = found('<script src="https://cdn.salla.network/js/app.js"></script>')
    expect(cdn.Salla?.evidence[0]).toContain('cdn.salla.network')
    expect(cdn.Salla?.confidence).toBeLessThan(100)
  })

  it('knows Zid by two of its cookies, and YouCan by its header and version', () => {
    const zid = found(
      '',
      ['set-cookie', 'zid_language=ar; path=/'],
      ['set-cookie', 'zid_country=SA'],
    )
    expect(zid.Zid).toMatchObject({ confidence: 100, source: 'arablyzer' })
    const one = found('', ['set-cookie', 'zid_language=ar; path=/'])
    expect(confidenceLevel(one.Zid?.confidence ?? 0)).toBe('medium')
    const youcan = found('', ['x-powered-by', 'Youcan.Private.DC/2.0'])
    expect(youcan.YouCan).toMatchObject({ version: '2.0', kind: 'platform' })
  })

  it('has ExpandCart at low confidence, as its markers were not verified', () => {
    const expand = found('<script src="https://cdn.expandcart.com/a.js"></script>')
    expect(confidenceLevel(expand.ExpandCart?.confidence ?? 0)).toBe('medium')
    expect(expand.ExpandCart?.confidence).toBeLessThan(75)
  })

  it('reads a page builder and a plugin from the addresses in the page', () => {
    const elementor = found(
      '<script src="/wp-content/plugins/elementor/assets/js/frontend-modules.min.js?ver=3.18.2"></script>',
    )
    expect(elementor.Elementor?.kind).toBe('builder')
  })

  it('does not hang on a hostile page: its strings are bounded', () => {
    const long = 'a'.repeat(200_000)
    const started = Date.now()
    found(
      `<meta name="generator" content="${long}"><script src="https://x.example/${long}"></script>`,
    )
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  it('maps a confidence to a word', () => {
    expect([100, 75, 74, 50, 49, 1].map(confidenceLevel)).toEqual([
      'high',
      'high',
      'medium',
      'medium',
      'low',
      'low',
    ])
  })
})
