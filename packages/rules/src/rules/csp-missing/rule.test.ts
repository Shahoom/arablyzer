import type { Header } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const HTML: Header = ['content-type', 'text/html; charset=utf-8']
const page = (html: string, ...headers: Header[]) =>
  evidenceOf(htmlPage(html, { url: 'https://shop.example/', headers: [HTML, ...headers] }))
const policy = (value: string) => page('<p>نص</p>', ['content-security-policy', value])

describe('csp-missing', () => {
  it('fires on a page with no policy, and on one whose policy only reports', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong'))).toEqual([
      { message: 'missing' },
    ])
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong-report-only'))).toEqual([
      {
        message: 'report-only',
        snippet: "Content-Security-Policy-Report-Only: default-src 'self'",
      },
    ])
  })

  it('passes a policy in the header, or in a <meta> in <head>', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right-meta'))).toEqual([])
  })

  it('reads the header as CSP3 does: a policy needs a directive', () => {
    for (const value of ['', ';', ' ; ;', ',']) {
      expect(detectAll(rule, policy(value)), JSON.stringify(value)).toEqual([
        { message: 'missing' },
      ])
    }
    // Names whatever their case; several policies in one header; any directive, however loose.
    for (const value of [
      "DEFAULT-SRC 'self'",
      ", script-src 'self'",
      'upgrade-insecure-requests',
      "default-src *; default-src 'none'",
    ]) {
      expect(detectAll(rule, policy(value)), value).toEqual([])
    }
  })

  it('skips a directive that is not ASCII, as browsers do', () => {
    // An Arabic host name must be written in Punycode (xn--) in a policy.
    expect(detectAll(rule, policy('script-src https://متجر.example'))).toEqual([
      { message: 'missing' },
    ])
    expect(detectAll(rule, policy('script-src https://xn--pgbep1f.example'))).toEqual([])
  })

  it('does not count a policy that only reports, beside or without another', () => {
    const reportOnly: Header = ['content-security-policy-report-only', "script-src 'self'"]
    expect(detectAll(rule, page('<p>نص</p>', reportOnly))).toEqual([
      { message: 'report-only', snippet: "Content-Security-Policy-Report-Only: script-src 'self'" },
    ])
    expect(
      detectAll(
        rule,
        page('<p>نص</p>', reportOnly, ['content-security-policy', "default-src 'self'"]),
      ),
    ).toEqual([])
  })

  it('reads a <meta> policy only in <head>, and without what a <meta> cannot set', () => {
    expect(
      detectAll(
        rule,
        page(
          '<html><head><meta http-equiv="content-security-policy" content="img-src \'self\'"></head></html>',
        ),
      ),
    ).toEqual([])
    const ignored = [
      // After <body> starts, the element is in the body, where browsers ignore it.
      '<html><head></head><body><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"></body></html>',
      // frame-ancestors, report-uri and sandbox are dropped from a <meta>, which leaves nothing.
      '<html><head><meta http-equiv="Content-Security-Policy" content="frame-ancestors \'none\'; sandbox"></head></html>',
      '<html><head><meta http-equiv="Content-Security-Policy" content=""></head></html>',
    ]
    for (const html of ignored) {
      expect(detectAll(rule, page(html)), html).toMatchObject([
        { message: 'meta-ignored', selector: expect.stringContaining('meta') as string },
      ])
    }
  })

  it('leaves out local development hosts and what is not HTML', () => {
    for (const url of ['http://localhost:4321/', 'http://127.0.0.1/', 'https://shop.test/']) {
      expect(applies(rule, evidenceOf(htmlPage('<p>نص</p>', { url }))), url).toBe(false)
    }
    const json = htmlPage('{}', {
      url: 'https://shop.example/data.json',
      headers: [['content-type', 'application/json']],
    })
    expect(applies(rule, evidenceOf(json))).toBe(false)
  })
})
