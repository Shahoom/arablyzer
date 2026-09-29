import { serveCrux, type CruxStandIn } from '@arablyzer/fixtures'
import { createPolicy } from '@arablyzer/egress'
import { afterEach, describe, expect, it } from 'vitest'
import { scan, type ScanProgress } from '../src/index'
import {
  flagRule,
  policyFor,
  renderRule,
  schemaErrors,
  tempSite,
  testRule,
  type TempSite,
} from './helpers'

// M2.4 plan §2 (BUILD-PLAN §13): a site that names ArablyzerBot in its robots.txt and disallows
// a page is not scanned there. robots.txt is read before the page, and the page is never asked
// for; only a group that names the bot counts, since a scan someone asks for is a visit, not a
// crawl.

let sites: TempSite[] = []
let standIn: CruxStandIn | undefined

afterEach(async () => {
  await Promise.all(sites.map((site) => site.close()))
  sites = []
  await standIn?.close()
  standIn = undefined
})

async function site(...args: Parameters<typeof tempSite>): Promise<TempSite> {
  const created = await tempSite(...args)
  sites.push(created)
  return created
}

const PAGE = `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>متجر</title><meta name="flag" content="x"></head>
<body><p>مرحبا بكم في متجرنا العربي</p></body>
</html>`

const robotsRule = testRule({ id: 'robots-rule', needs: ['robots'], detect: () => [] })
const RULES = [flagRule(), robotsRule]

describe('scan: the opt-out in robots.txt', () => {
  it('reads robots.txt first, and never asks for a page a group naming ArablyzerBot disallows', async () => {
    const local = await site({
      'index.html': PAGE,
      'robots.txt': '# Arablyzer, not here\nUser-agent: ArablyzerBot\nDisallow: /\n',
    })
    const steps: ScanProgress[] = []
    const report = await scan(local.url('/'), {
      rules: RULES,
      policy: policyFor(local),
      onProgress: (step) => steps.push(step),
    })
    expect(local.requests).toEqual(['GET /robots.txt'])
    expect(schemaErrors(report)).toBe('')
    expect(report.scan.status).toBe('failed')
    expect(report.scan.notices).toEqual([
      {
        code: 'opted-out',
        message: {
          ar: `يطلب ملف robots.txt في الموقع ألّا يفحص ArablyzerBot هذه الصفحة، فلم نفحصها. القاعدة «Disallow: /» في السطر 3 من ${local.url('/robots.txt')}.`,
          en: `The site’s robots.txt asks ArablyzerBot not to check this page, so it was not scanned. The rule “Disallow: /” is on line 3 of ${local.url('/robots.txt')}.`,
        },
      },
    ])
    expect(report.target).toMatchObject({
      url: local.url('/'),
      finalUrl: null,
      http: { status: null, contentType: null, redirects: [] },
    })
    expect(report.page).toBeNull()
    expect(report.facts).toEqual({})
    expect(report.findings).toEqual([])
    expect(report.rules.map((rule) => [rule.id, rule.status, rule.error])).toEqual([
      ['robots-rule', 'error', 'opted-out'],
      ['test-rule', 'error', 'opted-out'],
    ])
    expect(report.score).toMatchObject({ overall: null, partial: true })
    expect(steps).toEqual([
      { step: 'start', engines: [] },
      { step: 'robots', outcome: 'fetched', status: 200 },
    ])
  })

  it('never counts a User-agent: * group, which is for crawlers', async () => {
    const local = await site({ 'index.html': PAGE, 'robots.txt': 'User-agent: *\nDisallow: /\n' })
    const report = await scan(local.url('/'), { rules: RULES, policy: policyFor(local) })
    expect(report.scan).toMatchObject({ status: 'complete', notices: [] })
    expect(report.rules.map((rule) => [rule.id, rule.status])).toEqual([
      ['robots-rule', 'pass'],
      ['test-rule', 'fail'],
    ])
    expect(local.requests).toEqual(['GET /robots.txt', 'GET /'])
  })

  it('opts out the paths the group disallows, and scans the rest', async () => {
    // The bot's own group wins over `*`: here it is the only one that keeps it out of /private.
    const local = await site({
      'index.html': PAGE,
      'private/x.html': PAGE,
      'robots.txt': 'User-agent: *\nDisallow: /\n\nUser-agent: arablyzerbot\nDisallow: /private\n',
    })
    const home = await scan(local.url('/'), { rules: RULES, policy: policyFor(local) })
    expect(home.scan.status).toBe('complete')
    const hidden = await scan(local.url('/private/x.html'), {
      rules: RULES,
      policy: policyFor(local),
    })
    expect(hidden.scan.status).toBe('failed')
    expect(hidden.scan.notices[0]?.message.en).toContain('“Disallow: /private” is on line 5')
    expect(local.requests).toEqual(['GET /robots.txt', 'GET /', 'GET /robots.txt'])
  })

  it('scans a page an Allow opens to the bot', async () => {
    const local = await site({
      'shop/index.html': PAGE,
      'robots.txt': 'User-agent: ArablyzerBot/1.0\nDisallow: /\nAllow: /shop/\n',
    })
    const report = await scan(local.url('/shop/'), { rules: RULES, policy: policyFor(local) })
    expect(report.scan.status).toBe('complete')
    expect(local.requests).toEqual(['GET /robots.txt', 'GET /shop/'])
  })

  it('goes on when robots.txt is unavailable, unreachable or unreadable', async () => {
    for (const status of [404, 503, 999]) {
      const local = await site(
        { 'index.html': PAGE },
        { '/robots.txt': { status, body: 'User-agent: ArablyzerBot\nDisallow: /\n' } },
      )
      const report = await scan(local.url('/'), { rules: [flagRule()], policy: policyFor(local) })
      expect(report.scan, String(status)).toMatchObject({ status: 'complete', notices: [] })
      expect(local.requests, String(status)).toEqual(['GET /robots.txt', 'GET /'])
    }
  })

  it('names the bot by the user agent the scan sends', async () => {
    const local = await site({
      'index.html': PAGE,
      'robots.txt': 'User-agent: OtherBot\nDisallow: /\n',
    })
    const ours = await scan(local.url('/'), { rules: RULES, policy: policyFor(local) })
    expect(ours.scan.status).toBe('complete')
    const other = await scan(local.url('/'), {
      rules: RULES,
      policy: policyFor(local),
      userAgent: 'OtherBot/2.0 (+https://example.com/bot)',
    })
    expect(other.scan.status).toBe('failed')
    expect(other.scan.notices[0]?.message.en).toContain('asks OtherBot not to check this page')
  })

  it('reads robots.txt once when the page stays on its site, and the rules read that one', async () => {
    const local = await site(
      {
        'final/index.html': PAGE,
        'robots.txt': 'User-agent: *\nDisallow: /x\n',
      },
      { '/': { status: 301, headers: { location: '/final/' } } },
    )
    const steps: ScanProgress[] = []
    const report = await scan(local.url('/'), {
      rules: RULES,
      policy: policyFor(local),
      onProgress: (step) => steps.push(step),
    })
    expect(local.requests).toEqual(['GET /robots.txt', 'GET /', 'GET /final/'])
    expect(report.scan.status).toBe('complete')
    expect(report.facts.robots).toMatchObject({ url: local.url('/robots.txt'), status: 200 })
    expect(steps.map((step) => step.step)).toEqual(['start', 'robots', 'page', 'rules'])
  })

  it('reads the robots.txt of the site a redirect led to, which the rules then read', async () => {
    const final = await site({ 'index.html': PAGE, 'robots.txt': 'User-agent: *\nAllow: /\n' })
    const first = await site(
      { 'robots.txt': 'User-agent: *\nDisallow: /\n' },
      { '/': { status: 302, headers: { location: final.url('/') } } },
    )
    const report = await scan(first.url('/'), {
      rules: RULES,
      policy: createPolicy({
        allowTargets: [first, final].map((one) => ({ address: '127.0.0.1', port: one.port })),
      }),
    })
    expect(report.scan.status).toBe('complete')
    expect(report.facts.robots).toMatchObject({ url: final.url('/robots.txt'), status: 200 })
    expect(first.requests).toEqual(['GET /robots.txt', 'GET /'])
    expect(final.requests).toEqual(['GET /', 'GET /robots.txt'])
  })

  it('stops when that site opts out: no render, no CrUX, no rules, nothing of the page', async () => {
    const final = await site({
      'index.html': PAGE,
      'robots.txt': 'User-agent: ArablyzerBot\nDisallow: /\n',
    })
    const first = await site(
      { 'robots.txt': 'User-agent: ArablyzerBot\nAllow: /\n' },
      { '/': { status: 301, headers: { location: final.url('/') } } },
    )
    standIn = await serveCrux({ url: { lcp: 9_000 } })
    const steps: ScanProgress[] = []
    const report = await scan(first.url('/'), {
      rules: [
        ...RULES,
        renderRule(),
        testRule({ id: 'crux-rule', needs: ['crux'], detect: () => [] }),
      ],
      policy: createPolicy({
        allowTargets: [first.port, final.port, standIn.port].map((port) => ({
          address: '127.0.0.1',
          port,
        })),
      }),
      render: {
        engines: ['chromium'],
        executablePaths: { chromium: '/nonexistent/chromium' },
      },
      crux: { apiKey: 'opt-out-key', endpoint: standIn.endpoint },
      onProgress: (step) => steps.push(step),
    })
    expect(schemaErrors(report)).toBe('')
    expect(steps.map((step) => step.step)).toEqual(['start', 'robots', 'page', 'robots'])
    expect(standIn.queries).toEqual([])
    expect(final.requests).toEqual(['GET /', 'GET /robots.txt'])
    expect(report.scan.status).toBe('failed')
    expect(report.scan.render).toBeUndefined()
    expect(report.scan.notices.map((notice) => notice.code)).toEqual(['opted-out'])
    expect(report.scan.notices[0]?.message.en).toContain(final.url('/robots.txt'))
    expect(report.target).toMatchObject({
      url: first.url('/'),
      finalUrl: final.url('/'),
      http: { status: 200, redirects: [{ url: first.url('/'), status: 301 }] },
    })
    expect(report.page).toBeNull()
    expect(report.facts).toEqual({})
    expect(report.findings).toEqual([])
    expect(
      report.rules.every((rule) => rule.status === 'error' && rule.error === 'opted-out'),
    ).toBe(true)
  })
})
