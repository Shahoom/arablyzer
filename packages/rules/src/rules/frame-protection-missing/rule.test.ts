import type { Header } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const HTML: Header = ['content-type', 'text/html; charset=utf-8']
const page = (html: string, ...headers: Header[]) =>
  evidenceOf(htmlPage(html, { url: 'https://shop.example/', headers: [HTML, ...headers] }))
const xfo = (...values: string[]) =>
  page('<p>نص</p>', ...values.map((value): Header => ['x-frame-options', value]))

describe('frame-protection-missing', () => {
  it('fires on a page any site may frame, and on an X-Frame-Options browsers ignore', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong'))).toEqual([
      { message: 'missing' },
    ])
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong-allow-from'))).toEqual([
      {
        message: 'x-frame-options-ignored',
        values: { value: 'ALLOW-FROM https://partner.example/' },
        snippet: 'X-Frame-Options: ALLOW-FROM https://partner.example/',
      },
    ])
  })

  it('passes X-Frame-Options, or frame-ancestors in the policy header', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right-frame-ancestors'))).toEqual([])
  })

  it('counts DENY and SAMEORIGIN alone, whatever their case', () => {
    for (const values of [['DENY'], ['sameorigin'], [' SameOrigin '], ['DENY', 'deny']]) {
      expect(detectAll(rule, xfo(...values)), values.join(' | ')).toEqual([])
    }
    for (const value of ['ALLOWALL', 'ALLOW-FROM https://partner.example/', 'deny;', 'no', '']) {
      expect(detectAll(rule, xfo(value)), value).toMatchObject([
        { message: 'x-frame-options-ignored' },
      ])
    }
  })

  it('counts values that conflict, which browsers answer by refusing every frame (HTML)', () => {
    expect(detectAll(rule, xfo('DENY', 'SAMEORIGIN'))).toEqual([])
    expect(detectAll(rule, xfo('SAMEORIGIN, ALLOW-FROM https://partner.example/'))).toEqual([])
    expect(detectAll(rule, xfo('ALLOWALL, x'))).toEqual([])
    // Several values none of which blocks are as good as none.
    expect(detectAll(rule, xfo('a, b'))).toMatchObject([{ message: 'x-frame-options-ignored' }])
  })

  it('reads frame-ancestors only from an enforced policy header', () => {
    expect(
      detectAll(rule, page('<p>نص</p>', ['content-security-policy', "FRAME-ANCESTORS 'none'"])),
    ).toEqual([])
    expect(
      detectAll(
        rule,
        page('<p>نص</p>', ['content-security-policy-report-only', "frame-ancestors 'none'"]),
      ),
    ).toEqual([{ message: 'missing' }])
    expect(
      detectAll(rule, page('<p>نص</p>', ['content-security-policy', "default-src 'self'"])),
    ).toEqual([{ message: 'missing' }])
  })

  it('fires on a frame-ancestors that lets any site in, which X-Frame-Options cannot undo', async () => {
    // Browsers ignore X-Frame-Options once an enforced policy has frame-ancestors (HTML).
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong-frame-ancestors-any'))).toEqual([
      {
        message: 'any-ancestor',
        values: { value: '*' },
        snippet: 'Content-Security-Policy: frame-ancestors *',
      },
    ])
    const csp = (value: string) =>
      detectAll(rule, page('<p>نص</p>', ['content-security-policy', value]))
    for (const any of [
      'frame-ancestors https:',
      'frame-ancestors https://*',
      "frame-ancestors 'none' *",
    ]) {
      expect(csp(any), any).toMatchObject([{ message: 'any-ancestor' }])
    }
    // Named sites, and an empty list, which matches none, keep the others out.
    for (const some of [
      'frame-ancestors https://partner.example',
      'frame-ancestors https://*.partner.example',
      'frame-ancestors',
    ]) {
      expect(csp(some), some).toEqual([])
    }
    // Browsers enforce every policy they get: one that keeps others out is enough.
    expect(csp("frame-ancestors *, frame-ancestors 'self'")).toEqual([])
  })

  it('names a <meta> that tries, since browsers read neither from one', () => {
    const findings = detectAll(
      rule,
      page(`<html><head>
<meta http-equiv="Content-Security-Policy" content="frame-ancestors 'none'">
<meta http-equiv="X-Frame-Options" content="DENY">
</head></html>`),
    )
    expect(findings).toMatchObject([
      { message: 'meta', location: { line: 2 } },
      { message: 'meta', location: { line: 3 } },
    ])
  })

  it('leaves out local development hosts and what is not HTML', () => {
    for (const url of ['http://localhost:4321/', 'http://10.0.0.5/', 'https://shop.test/']) {
      expect(applies(rule, evidenceOf(htmlPage('<p>نص</p>', { url }))), url).toBe(false)
    }
    const image = htmlPage('', {
      url: 'https://shop.example/og.png',
      headers: [['content-type', 'image/png']],
    })
    expect(applies(rule, evidenceOf(image))).toBe(false)
  })
})
