import { createPolicy } from '@arablyzer/egress'
import type { Report } from '@arablyzer/report-schema'
import { afterEach, describe, expect, it } from 'vitest'
import { MAX_FINDINGS_PER_RULE, ROBOTS_MAX_BYTES, scan, USER_AGENT } from '../src/index'
import { flagRule, policyFor, schemaErrors, tempSite, testRule, type TempSite } from './helpers'

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

const ARABIC_PAGE = `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>متجر</title>
<meta name="flag" content="first">
<meta name="flag" content="second">
</head>
<body><p>مرحبا بكم في متجرنا العربي</p></body>
</html>`

/** Everything except the two values that may differ between runs. */
function stable(report: Report) {
  return {
    ...report,
    target: { ...report.target, fetchedAt: '' },
    scan: { ...report.scan, durationMs: 0 },
  }
}

describe('scan', () => {
  it('produces a complete, schema-valid report with rendered messages and evidence', async () => {
    const local = await site({ 'index.html': ARABIC_PAGE })
    const report = await scan(local.url('/'), { rules: [flagRule()], policy: policyFor(local) })
    expect(schemaErrors(report)).toBe('')
    expect(report.scan).toMatchObject({ status: 'complete', notices: [] })
    expect(report.target).toMatchObject({
      url: local.url('/'),
      finalUrl: local.url('/'),
      userAgent: USER_AGENT,
      http: { status: 200, contentType: 'text/html; charset=utf-8', redirects: [] },
    })
    expect(report.page).toEqual({ lang: 'ar', dir: 'rtl', dominantScript: 'arabic' })
    expect(report.rules).toEqual([
      {
        id: 'test-rule',
        version: '1.0.0',
        category: 'onpage',
        severity: 'serious',
        wcag: ['3.1.1'],
        status: 'fail',
        title: { ar: 'قاعدة test-rule', en: 'Rule test-rule' },
      },
    ])
    expect(report.summary).toEqual({
      pass: 0,
      fail: 1,
      needsReview: 0,
      notApplicable: 0,
      error: 0,
      bySeverity: { critical: 0, serious: 1, moderate: 0, minor: 0, info: 0 },
    })
    expect(report.findings.map((finding) => [finding.message, finding.evidence])).toEqual([
      [
        { ar: 'وجدنا first', en: 'Found first' },
        {
          url: local.url('/'),
          selector: 'head > meta:nth-of-type(2)',
          snippet: '<meta name="flag" content="first">',
          location: { line: 4, column: 1 },
          values: { what: 'first' },
        },
      ],
      [
        { ar: 'وجدنا second', en: 'Found second' },
        expect.objectContaining({ location: { line: 5, column: 1 } }),
      ],
    ])
    expect(report.facts).toEqual({})
  })

  it('gives the same report for the same page, apart from fetchedAt and durationMs', async () => {
    const local = await site({
      'index.html': ARABIC_PAGE,
      'robots.txt': 'User-agent: *\nDisallow: /x\n',
    })
    const options = {
      rules: [flagRule(), testRule({ id: 'robots-rule', needs: ['robots'], detect: () => [] })],
      policy: policyFor(local),
    }
    const first = await scan(local.url('/'), options)
    const second = await scan(local.url('/'), options)
    expect(stable(second)).toEqual(stable(first))
    expect(new Set(first.findings.map((finding) => finding.fingerprint)).size).toBe(2)
  })

  it('keeps fingerprints unique and caps findings per rule', async () => {
    const metas = Array.from(
      { length: MAX_FINDINGS_PER_RULE + 5 },
      () => '<meta name="flag" content="same">',
    ).join('')
    const local = await site({
      'index.html': `<html lang="ar"><head>${metas}</head><body>نص</body></html>`,
    })
    const report = await scan(local.url('/'), {
      rules: [
        testRule({
          detect: () =>
            Array.from({ length: MAX_FINDINGS_PER_RULE + 5 }, () => ({
              message: 'found',
              values: { what: 'x' },
            })),
        }),
      ],
      policy: policyFor(local),
    })
    expect(report.findings).toHaveLength(MAX_FINDINGS_PER_RULE)
    expect(report.rules[0]?.findingsOmitted).toBe(5)
    expect(new Set(report.findings.map((finding) => finding.fingerprint)).size).toBe(
      MAX_FINDINGS_PER_RULE,
    )
  })

  it('records redirects and scans the final URL', async () => {
    const local = await site(
      { 'final/index.html': ARABIC_PAGE },
      { '/': { status: 301, headers: { location: '/final/' } } },
    )
    const report = await scan(local.url('/'), { rules: [flagRule()], policy: policyFor(local) })
    expect(report.target.finalUrl).toBe(local.url('/final/'))
    expect(report.target.http.redirects).toEqual([{ url: local.url('/'), status: 301 }])
    expect(report.findings[0]?.evidence.url).toBe(local.url('/final/'))
  })

  it('fails the scan on a blocked address without revealing it', async () => {
    const report = await scan('http://127.0.0.1/', { rules: [flagRule()] })
    expect(schemaErrors(report)).toBe('')
    expect(report.scan.status).toBe('failed')
    expect(report.scan.notices.map((item) => item.code)).toEqual(['blocked-address'])
    expect(report.page).toBeNull()
    expect(report.rules[0]).toMatchObject({ status: 'error', error: 'page-unavailable' })
    expect(JSON.stringify(report.scan)).not.toMatch(/127\.0\.0\.1|loopback/)
  })

  it('skips content rules on an error page but still runs robots rules', async () => {
    const local = await site(
      { 'robots.txt': 'User-agent: *\nAllow: /\n' },
      { '/': { status: 404, body: '<p>غير موجود</p>' } },
    )
    const report = await scan(local.url('/'), {
      rules: [flagRule(), testRule({ id: 'robots-rule', needs: ['robots'], detect: () => [] })],
      policy: policyFor(local),
    })
    expect(report.scan.status).toBe('complete')
    expect(report.rules.map((rule) => [rule.id, rule.status])).toEqual([
      ['robots-rule', 'pass'],
      ['test-rule', 'not-applicable'],
    ])
    expect(report.scan.notices).toEqual([
      {
        code: 'page-status',
        message: {
          ar: 'الصفحة ردّت بالحالة HTTP 404، فلم نفحص محتواها.',
          en: 'The page answered HTTP 404, so its content was not checked.',
        },
      },
    ])
  })

  it('checks only headers on non-HTML responses', async () => {
    const local = await site(
      {},
      {
        '/': {
          headers: { 'content-type': 'application/pdf', 'x-robots-tag': 'noindex' },
          body: '%PDF-1.7',
        },
      },
    )
    const headerRule = testRule({
      id: 'header-rule',
      needs: ['http'],
      detect: ({ page }) =>
        page.headers.some(([name]) => name === 'x-robots-tag')
          ? [{ message: 'found', values: { what: 'header' } }]
          : [],
    })
    const report = await scan(local.url('/'), {
      rules: [flagRule(), headerRule],
      policy: policyFor(local),
    })
    expect(report.page).toBeNull()
    expect(report.rules.map((rule) => [rule.id, rule.status])).toEqual([
      ['header-rule', 'fail'],
      ['test-rule', 'not-applicable'],
    ])
    expect(report.scan.notices.map((item) => item.code)).toEqual(['not-html'])
  })

  it('warns when the raw HTML has almost no text but loads scripts', async () => {
    const local = await site({
      'index.html': '<div id="root"></div><script src="/app.js"></script>',
    })
    const report = await scan(local.url('/'), { rules: [flagRule()], policy: policyFor(local) })
    expect(report.scan.notices.map((item) => item.code)).toEqual(['little-text'])
    const jsonLdOnly = await site({
      'index.html': '<p>x</p><script type="application/ld+json">{}</script>',
    })
    const quiet = await scan(jsonLdOnly.url('/'), {
      rules: [flagRule()],
      policy: policyFor(jsonLdOnly),
    })
    expect(quiet.scan.notices).toEqual([])
  })

  it('reports rule errors as a partial scan', async () => {
    const local = await site({ 'index.html': ARABIC_PAGE })
    const broken = testRule({
      id: 'broken-rule',
      detect: () => {
        throw new Error('bug')
      },
    })
    const report = await scan(local.url('/'), {
      rules: [broken, flagRule()],
      policy: policyFor(local),
    })
    expect(report.scan.status).toBe('partial')
    expect(report.rules.find((rule) => rule.id === 'broken-rule')).toMatchObject({
      status: 'error',
      error: 'rule-failed',
    })
    expect(report.summary.error).toBe(1)
  })

  it('reports manual checks as needs-review', async () => {
    const local = await site({ 'index.html': ARABIC_PAGE })
    const report = await scan(local.url('/'), {
      rules: [flagRule({ manualCheck: true })],
      policy: policyFor(local),
    })
    expect(report.rules[0]?.status).toBe('needs-review')
    expect(report.summary).toMatchObject({ needsReview: 1, fail: 0 })
  })

  it('selects rules by id and rejects unknown ids', async () => {
    const local = await site({ 'index.html': ARABIC_PAGE })
    const rules = [flagRule(), testRule({ id: 'other-rule', detect: () => [] })]
    const report = await scan(local.url('/'), {
      rules,
      ruleIds: ['other-rule'],
      policy: policyFor(local),
    })
    expect(report.rules.map((rule) => rule.id)).toEqual(['other-rule'])
    await expect(scan(local.url('/'), { rules, ruleIds: ['nope'] })).rejects.toThrow(
      /Unknown rule id: nope/,
    )
    await expect(scan(' ', { rules })).rejects.toThrow(TypeError)
  })
})

describe('scan: robots.txt', () => {
  const robotsRule = testRule({
    id: 'robots-rule',
    needs: ['robots'],
    detect: ({ robots }) =>
      robots?.outcome === 'fetched'
        ? []
        : [{ message: 'found', values: { what: robots?.outcome ?? '' } }],
  })

  it('fetches robots.txt only when a selected rule needs it', async () => {
    const local = await site({
      'index.html': ARABIC_PAGE,
      'robots.txt': 'User-agent: *\nDisallow: /\n',
    })
    const without = await scan(local.url('/'), { rules: [flagRule()], policy: policyFor(local) })
    expect(without.facts).toEqual({})
    const withRobots = await scan(local.url('/'), { rules: [robotsRule], policy: policyFor(local) })
    expect(withRobots.facts.robots).toMatchObject({ url: local.url('/robots.txt'), status: 200 })
    expect(
      withRobots.facts.robots?.aiCrawlers.find((crawler) => crawler.token === 'OAI-SearchBot'),
    ).toEqual({
      token: 'OAI-SearchBot',
      purpose: 'search',
      allowed: false,
    })
  })

  it('follows up to five robots.txt redirects, then treats it as unavailable', async () => {
    const hops = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [
        i === 0 ? '/robots.txt' : `/r${i}`,
        { status: 301, headers: { location: `/r${i + 1}` } },
      ]),
    )
    const local = await site(
      { 'index.html': ARABIC_PAGE, r6: 'User-agent: *\nDisallow: /\n' },
      hops,
    )
    const report = await scan(local.url('/'), { rules: [robotsRule], policy: policyFor(local) })
    expect(report.findings[0]?.message.en).toBe('Found unavailable')
    const short = await site(
      { 'index.html': ARABIC_PAGE, 'real.txt': 'User-agent: *\nDisallow: /\n' },
      { '/robots.txt': { status: 301, headers: { location: '/real.txt' } } },
    )
    const followed = await scan(short.url('/'), { rules: [robotsRule], policy: policyFor(short) })
    expect(followed.rules[0]?.status).toBe('pass')
    expect(followed.facts.robots?.aiCrawlers.every((crawler) => !crawler.allowed)).toBe(true)
  })

  it('reports a rule error, not a verdict, when robots.txt redirects somewhere blocked', async () => {
    const local = await site(
      { 'index.html': ARABIC_PAGE },
      {
        '/robots.txt': { status: 302, headers: { location: 'http://169.254.169.254/robots.txt' } },
      },
    )
    const report = await scan(local.url('/'), {
      rules: [robotsRule, flagRule()],
      policy: policyFor(local),
    })
    expect(report.scan.status).toBe('partial')
    expect(report.rules[0]).toMatchObject({
      id: 'robots-rule',
      status: 'error',
      error: 'robots-unchecked',
    })
    expect(report.scan.notices.map((item) => item.code)).toEqual(['robots-unchecked'])
    expect(report.facts).toEqual({})
    expect(JSON.stringify(report)).not.toContain('169.254')
  })

  it('reads only the first 500 KiB of robots.txt and says so', async () => {
    const big = `User-agent: *\nDisallow: /private\n${'# padding\n'.repeat(ROBOTS_MAX_BYTES / 10 + 10)}`
    const local = await site({ 'index.html': ARABIC_PAGE, 'robots.txt': big })
    const report = await scan(local.url('/'), { rules: [robotsRule], policy: policyFor(local) })
    expect(report.scan.notices.map((item) => item.code)).toEqual(['robots-truncated'])
    expect(report.rules[0]?.status).toBe('pass')
  })

  it('uses the policy for robots.txt too', async () => {
    const local = await site({ 'index.html': ARABIC_PAGE })
    // --allow-private opens loopback on any port for local builds.
    const report = await scan(local.url('/'), {
      rules: [robotsRule],
      policy: createPolicy({ allowPrivate: true }),
    })
    expect(report.rules[0]).toMatchObject({ status: 'fail' })
    expect(report.findings[0]?.message.en).toBe('Found unavailable')
  })
})
