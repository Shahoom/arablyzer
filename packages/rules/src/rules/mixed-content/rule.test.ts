import { describe, expect, it } from 'vitest'
import { applies, detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const secure = (html: string) => evidenceOf(htmlPage(html, { url: 'https://shop.example/' }))

describe('mixed-content', () => {
  it('fires on an HTTPS page with an image over http:', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong'))).toMatchObject([
      {
        message: 'upgradable',
        values: { tag: 'img', url: 'http://shop.example/images/halwa.jpg' },
        selector: expect.any(String) as string,
      },
    ])
  })

  it('passes the page with its image over https:', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
  })

  it('tells blocked loads and forms apart', () => {
    const findings = detectAll(
      rule,
      secure(
        '<script src="http://cdn.example/app.js"></script><form action="http://shop.example/join"></form>',
      ),
    )
    expect(findings.map((finding) => finding.message)).toEqual(['blockable', 'form'])
  })

  it('passes a page that asks for upgrade-insecure-requests in its policy header (M1.3a review)', () => {
    const loads =
      '<script src="http://cdn.example/app.js"></script><img src="http://cdn.example/a.png">' +
      '<form action="http://pay.example/checkout"></form>'
    const withHeader = (name: string, value: string) =>
      evidenceOf(
        htmlPage(loads, {
          url: 'https://shop.example/',
          headers: [
            ['content-type', 'text/html; charset=utf-8'],
            [name, value],
          ],
        }),
      )
    expect(
      detectAll(
        rule,
        withHeader('content-security-policy', "default-src 'self', upgrade-insecure-requests"),
      ),
    ).toEqual([])
    // A policy only reported upgrades nothing.
    expect(
      detectAll(
        rule,
        withHeader('content-security-policy-report-only', 'upgrade-insecure-requests'),
      ),
    ).toHaveLength(3)
  })

  it('upgrades what comes after a policy <meta> in <head>, and not what comes before', () => {
    const findings = detectAll(
      rule,
      secure(`<html><head>
<script src="http://cdn.example/early.js"></script>
<meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">
<script src="http://cdn.example/late.js"></script>
</head><body><img src="http://cdn.example/a.png"></body></html>`),
    )
    expect(findings.map((finding) => finding.values?.url)).toEqual(['http://cdn.example/early.js'])
  })

  it('ignores a policy <meta> outside <head>', () => {
    const findings = detectAll(
      rule,
      secure(
        '<body><meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests"><img src="http://cdn.example/a.png"></body>',
      ),
    )
    expect(findings).toHaveLength(1)
  })

  it('leaves out pages served over plain HTTP', () => {
    const page = htmlPage('<img src="http://cdn.example/a.png">', { url: 'http://shop.example/' })
    expect(applies(rule, evidenceOf(page))).toBe(false)
  })
})
