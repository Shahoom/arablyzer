import { collectPage } from '@arablyzer/collectors'
import { afterEach, describe, expect, it } from 'vitest'
import { evaluatePage, scan } from '../src/index'
import {
  flagRule,
  policyFor,
  resolverFor,
  schemaErrors,
  tempSite,
  testRule,
  type TempSite,
} from './helpers'

let sites: TempSite[] = []

afterEach(async () => {
  await Promise.all(sites.map((site) => site.close()))
  sites = []
})

async function site(...args: Parameters<typeof tempSite>): Promise<TempSite> {
  const created = await tempSite(...args)
  sites.push(created)
  return created
}

/** A challenge page as a service sends one: HTML, with a script and a flag a page rule would read. */
const CHALLENGE_PAGE =
  '<!doctype html><html><head><title>Just a moment...</title><meta name="flag" content="challenge"></head><body><script src="/challenge.js"></script></body></html>'
const PAGE = '<!doctype html><html lang="ar" dir="rtl"><title>متجر</title><p>مرحبا</p></html>'

/** A rule that reads the page's answer, whatever its status. */
const responseRule = testRule({
  id: 'response-rule',
  needs: ['response'],
  detect: ({ page }) => [{ message: 'found', values: { what: String(page.status) } }],
})
const robotsRule = testRule({ id: 'robots-rule', needs: ['robots'], detect: () => [] })

describe('scan: a bot challenge in place of the page', () => {
  it('says the site answered with a challenge, and judges nothing of it as the page', async () => {
    const local = await site(
      { 'robots.txt': 'User-agent: *\nAllow: /\n' },
      {
        '/': {
          status: 403,
          headers: { 'content-type': 'text/html; charset=UTF-8', 'cf-mitigated': 'challenge' },
          body: CHALLENGE_PAGE,
        },
      },
    )
    const report = await scan(local.url('/'), {
      rules: [flagRule(), responseRule, robotsRule],
      policy: policyFor(local),
    })
    expect(schemaErrors(report)).toBe('')
    // The scan did not reach the page: it is short, and has no score for what was not checked.
    expect(report.scan.status).toBe('partial')
    expect(report.score).toMatchObject({ overall: null, categories: { onpage: null } })
    expect(report.scan.notices.map((item) => [item.code, item.message.en])).toEqual([
      [
        'bot-challenge',
        'The site answered with a Cloudflare bot challenge (HTTP 403) instead of the page, so its content was not checked: Arablyzer never tries to get past a challenge.',
      ],
    ])
    expect(report.rules.map((rule) => [rule.id, rule.status])).toEqual([
      ['response-rule', 'fail'],
      ['robots-rule', 'pass'],
      ['test-rule', 'not-applicable'],
    ])
    expect(report.findings.map((finding) => finding.message.en)).toEqual(['Found 403'])
    expect(report.page).toBeNull()
  })

  // M2.3c review: a Cloudflare challenge (403) and an AWS WAF one (202) reported `complete` and
  // 100, because the rules beside the page (robots.txt, sitemaps, the answer) passed.
  it.each([
    ['Cloudflare', 403, { 'cf-mitigated': 'challenge' }],
    ['AWS WAF', 202, { 'x-amzn-waf-action': 'challenge' }],
  ])(
    'gives a %s challenge no score, and does not call the scan complete',
    async (_name, status, header) => {
      const local = await site(
        { 'robots.txt': 'User-agent: *\nAllow: /\n' },
        {
          '/': {
            status,
            headers: { 'content-type': 'text/html; charset=UTF-8', ...header },
            body: CHALLENGE_PAGE,
          },
        },
      )
      // The rules that ran beside the page count for a score when they pass: a serious one does here.
      const report = await scan(local.url('/'), {
        rules: [flagRule(), testRule({ id: 'robots-rule', needs: ['robots'], detect: () => [] })],
        policy: policyFor(local),
      })
      expect(schemaErrors(report)).toBe('')
      expect(report.rules.map((rule) => [rule.id, rule.status])).toEqual([
        ['robots-rule', 'pass'],
        ['test-rule', 'not-applicable'],
      ])
      expect(report.score).toEqual({
        overall: null,
        categories: { onpage: null },
        partial: false,
        rules: { ran: 2, total: 2 },
      })
      expect(report.scan.status).toBe('partial')
      expect(report.page).toBeNull()
    },
  )

  it('neither renders nor measures one that answers 2xx, where a browser would run its script', async () => {
    const local = await site(
      {},
      {
        '/': {
          status: 202,
          headers: { 'content-type': 'text/html; charset=UTF-8', 'x-amzn-waf-action': 'challenge' },
          body: CHALLENGE_PAGE,
        },
      },
    )
    const report = await scan(local.url('/'), {
      rules: [flagRule(), responseRule],
      policy: policyFor(local),
      render: { engines: ['chromium'], executablePaths: { chromium: '/nonexistent/browser' } },
      lab: { executablePath: '/nonexistent/browser' },
    })
    expect(report.rules.map((rule) => [rule.id, rule.status])).toEqual([
      ['response-rule', 'fail'],
      ['test-rule', 'not-applicable'],
    ])
    // No engine was started, and Lighthouse was not asked: nothing opened the challenge.
    expect(report.scan.render).toEqual([])
    expect(report.facts.lab).toBeUndefined()
    expect(report.scan.notices.map((item) => item.code)).toEqual(['bot-challenge'])
    expect(local.requests).toEqual(['GET /robots.txt', 'GET /'])
  })

  it('reads the page’s answer for a response rule when the page is reached too', async () => {
    const local = await site({ 'index.html': PAGE })
    const report = await scan(local.url('/'), {
      rules: [responseRule],
      policy: policyFor(local),
    })
    expect(report.findings.map((finding) => finding.message.en)).toEqual(['Found 200'])
    expect(report.scan.notices).toEqual([])
  })

  it('gives no robots.txt verdict when robots.txt is a challenge, and goes on to the page', async () => {
    const local = await site(
      { 'index.html': PAGE },
      {
        '/robots.txt': {
          status: 403,
          headers: { 'cf-mitigated': 'challenge' },
          body: CHALLENGE_PAGE,
        },
      },
    )
    const report = await scan(local.url('/'), { rules: [robotsRule], policy: policyFor(local) })
    expect(report.rules[0]).toMatchObject({ status: 'error', error: 'robots-unchecked' })
    expect(report.scan.notices.map((item) => item.code)).toEqual(['robots-unchecked'])
    expect(local.requests).toEqual(['GET /robots.txt', 'GET /'])
  })

  it('gives no sitemap verdict when a sitemap is a challenge', async () => {
    const local = await site(
      { 'site.json': JSON.stringify({ host: 'shop.example' }), 'index.html': PAGE },
      {
        '/sitemap.xml': {
          status: 403,
          headers: { 'cf-mitigated': 'challenge' },
          body: CHALLENGE_PAGE,
        },
      },
    )
    const sitemapRule = testRule({
      id: 'sitemap-rule',
      needs: ['robots', 'sitemap'],
      detect: () => [],
    })
    const report = await scan(local.url('/'), {
      rules: [sitemapRule],
      policy: policyFor(local),
      resolver: resolverFor(local),
    })
    expect(report.rules[0]).toMatchObject({ status: 'error', error: 'sitemap-unchecked' })
  })
})

describe('evaluatePage: a bot challenge', () => {
  it('judges nothing of it as the page, and gives it to a rule of the response', () => {
    const challenge = collectPage({
      url: 'https://shop.example/',
      status: 405,
      headers: [
        ['content-type', 'text/html; charset=UTF-8'],
        ['x-amzn-waf-action', 'captcha'],
      ],
      body: new TextEncoder().encode(CHALLENGE_PAGE),
    })
    const { results } = evaluatePage(challenge, { rules: [flagRule(), responseRule] })
    expect(results.map((result) => [result.id, result.status])).toEqual([
      ['response-rule', 'fail'],
      ['test-rule', 'not-applicable'],
    ])
  })
})
