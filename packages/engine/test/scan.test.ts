import { HTML_PARSE_LIMIT } from '@arablyzer/collectors'
import { createPolicy, type Resolver } from '@arablyzer/egress'
import type { Report } from '@arablyzer/report-schema'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MAX_FINDINGS_PER_RULE,
  MAX_SELECTOR_LENGTH,
  MAX_VALUE_ITEMS,
  MAX_VALUE_LENGTH,
  ROBOTS_MAX_BYTES,
  scan,
  USER_AGENT,
} from '../src/index'
import type { Rule } from '@arablyzer/rules'
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

  it('gives the rules that need them the redirects the fetch followed, in order (M2.3a)', async () => {
    const local = await site(
      { 'ar/index.html': ARABIC_PAGE },
      {
        '/': { status: 302, headers: { location: '/ar' } },
        '/ar': { status: 301, headers: { location: '/ar/' } },
      },
    )
    const seen: Record<string, unknown> = {}
    const watch = (id: string, needs: Rule['needs']) =>
      testRule({
        id,
        needs,
        detect: (evidence) => {
          seen[id] = evidence.redirects
          return []
        },
      })
    const rules = [watch('reads-redirects', ['redirects']), watch('reads-html', ['html'])]
    const report = await scan(local.url('/'), { rules, policy: policyFor(local) })
    const hops = [
      { url: local.url('/'), status: 302 },
      { url: local.url('/ar'), status: 301 },
    ]
    expect(seen).toEqual({ 'reads-redirects': hops, 'reads-html': undefined })
    // The report is what it was: the redirects are in its target, and nowhere else.
    expect(report.target.http.redirects).toEqual(hops)
    expect(report.rules.map((rule) => rule.status)).toEqual(['pass', 'pass'])
    expect(JSON.stringify(report.facts)).toBe('{}')
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
    // Nothing of the page was checked: the scan is short, and its robots.txt rule alone is no
    // score for a page (M2.3c review).
    expect(report.scan.status).toBe('partial')
    expect(report.score).toMatchObject({ overall: null, categories: { onpage: null } })
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

  it.each([401, 403, 429, 500, 503])(
    'gives a page the site refuses with HTTP %i no score, and does not call the scan complete',
    async (status) => {
      const local = await site(
        { 'robots.txt': 'User-agent: *\nAllow: /\n' },
        { '/': { status, body: 'Forbidden' } },
      )
      const report = await scan(local.url('/'), {
        rules: [flagRule(), testRule({ id: 'robots-rule', needs: ['robots'], detect: () => [] })],
        policy: policyFor(local),
      })
      expect(schemaErrors(report)).toBe('')
      expect(report.scan.status).toBe('partial')
      expect(report.score.overall).toBeNull()
      expect(report.target.http.status).toBe(status)
    },
  )

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

describe('scan: hostile pages and rules', () => {
  const headerRule = testRule({ id: 'header-rule', needs: ['http'], detect: () => [] })
  const robotsRule = testRule({ id: 'robots-rule', needs: ['robots'], detect: () => [] })

  it('stops parsing HTML that takes too long, and still runs the rules that do not need it', async () => {
    const local = await site({
      'index.html': `<html lang="ar"><body>${'<p>نص</p>'.repeat(50_000)}</body></html>`,
      'robots.txt': 'User-agent: *\nAllow: /\n',
    })
    const report = await scan(local.url('/'), {
      rules: [flagRule(), headerRule, robotsRule],
      policy: policyFor(local),
      parseTimeoutMs: 1,
    })
    expect(schemaErrors(report)).toBe('')
    expect(report.scan.status).toBe('partial')
    expect(report.scan.notices.map((item) => item.code)).toEqual(['page-too-complex'])
    expect(report.rules.map((rule) => [rule.id, rule.status, rule.error])).toEqual([
      ['header-rule', 'pass', undefined],
      ['robots-rule', 'pass', undefined],
      ['test-rule', 'error', 'page-too-complex'],
    ])
    expect(report.page).toBeNull()
  })

  // H1 of the pre-launch review: a page of 1.4 million <p> is 4 KB gzipped and 4.2 MB read, and its
  // tree took more heap than the scanner's container has: the process died, and every scan queued
  // behind it failed. Now such a page is too complex at a limit of its own, whatever the clock says.
  describe.each([
    ['1.4 million elements', `<html lang="ar"><body>${'<p>'.repeat(1_400_000)}`],
    ['100,000 nested elements', `<html lang="ar"><body>${'<div>'.repeat(100_000)}`],
    ['2 million comments', `<html lang="ar"><body>${'<!---->'.repeat(2_000_000)}`],
  ])('a page of %s', (_what, html) => {
    it('is too complex at once, and the rules that need no HTML still run', async () => {
      const local = await site(
        { 'index.html': html, 'robots.txt': 'User-agent: *\nAllow: /\n' },
        { '/': { compress: 'gzip' } },
      )
      const started = performance.now()
      const report = await scan(local.url('/'), {
        rules: [flagRule(), headerRule, robotsRule],
        policy: policyFor(local),
      })
      // The nested page took 30 s, the deadline's, before: this tells it on a machine that is busy.
      expect(performance.now() - started).toBeLessThan(15_000)
      expect(schemaErrors(report)).toBe('')
      expect(report.scan.status).toBe('partial')
      expect(report.scan.notices.map((item) => item.code)).toEqual(['page-too-complex'])
      expect(report.rules.map((rule) => [rule.id, rule.status, rule.error])).toEqual([
        ['header-rule', 'pass', undefined],
        ['robots-rule', 'pass', undefined],
        ['test-rule', 'error', 'page-too-complex'],
      ])
      expect(report.page).toBeNull()
    })
  })

  it('rejects a parse budget that is not a positive number, naming the right option', async () => {
    // A loopback URL: were the check missing, the scan would fail on the address, not throw.
    for (const parseTimeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(scan('http://127.0.0.1/', { parseTimeoutMs })).rejects.toThrow(/parseTimeoutMs/)
    }
    await expect(scan('http://127.0.0.1/', { timeoutMs: Number.NaN })).rejects.toThrow(/timeoutMs/)
    await expect(scan('http://127.0.0.1/', { timeoutMs: Number.NaN })).rejects.not.toThrow(
      /parseTimeoutMs/,
    )
  })

  it('counts every finding a rule yields but keeps only the first by position', async () => {
    const local = await site({ 'index.html': ARABIC_PAGE })
    const total = 100_000
    const report = await scan(local.url('/'), {
      rules: [
        testRule({
          // Last line first, and one finding past the cap that would not fit the schema:
          // only the reported findings are rendered and checked.
          *detect() {
            for (let line = total; line >= 1; line--) {
              yield {
                message: 'found',
                values: { what: line === 500 ? Number.NaN : 'x' },
                location: { line },
              }
            }
          },
        }),
      ],
      policy: policyFor(local),
    })
    expect(report.rules[0]).toMatchObject({
      status: 'fail',
      findingsOmitted: total - MAX_FINDINGS_PER_RULE,
    })
    expect(report.findings.map((finding) => finding.evidence.location?.line)).toEqual(
      Array.from({ length: MAX_FINDINGS_PER_RULE }, (_, i) => i + 1),
    )
  })

  // Parsing 15 MB takes seconds; four-byte characters halve that, since the limit is in bytes.
  it(
    'reads only the first 15 MB of HTML, as Google does, and says so',
    { timeout: 30_000 },
    async () => {
      const head = '<html lang="ar"><head><meta name="flag" content="early"></head><body><p>'
      const local = await site({
        'index.html': `${head}${'😀'.repeat(HTML_PARSE_LIMIT / 4)}<meta name="flag" content="late">`,
      })
      const report = await scan(local.url('/'), { rules: [flagRule()], policy: policyFor(local) })
      expect(report.scan.status).toBe('complete')
      expect(report.scan.notices.map((item) => item.code)).toEqual(['page-truncated'])
      expect(report.findings.map((finding) => finding.evidence.values?.what)).toEqual(['early'])
    },
  )

  it('fails the scan when the page answers a status that is not HTTP', async () => {
    const local = await site({}, { '/': { status: 999, body: ARABIC_PAGE } })
    const report = await scan(local.url('/'), { rules: [flagRule()], policy: policyFor(local) })
    expect(schemaErrors(report)).toBe('')
    expect(report.scan.status).toBe('failed')
    expect(report.scan.notices.map((item) => item.code)).toEqual(['invalid-status'])
    expect(report.target.http.status).toBeNull()
    expect(report.rules[0]).toMatchObject({ status: 'error', error: 'page-unavailable' })
  })

  it('gives no robots.txt verdict when robots.txt answers a status that is not HTTP', async () => {
    const local = await site(
      { 'index.html': ARABIC_PAGE },
      { '/robots.txt': { status: 999, body: 'User-agent: *\nDisallow: /\n' } },
    )
    const report = await scan(local.url('/'), { rules: [robotsRule], policy: policyFor(local) })
    expect(schemaErrors(report)).toBe('')
    expect(report.scan.status).toBe('partial')
    expect(report.rules[0]).toMatchObject({ status: 'error', error: 'robots-unchecked' })
    expect(report.scan.notices.map((item) => item.code)).toEqual(['robots-unchecked'])
  })

  it('bounds the strings, lists and selectors a rule puts in the report', async () => {
    const local = await site({ 'index.html': ARABIC_PAGE })
    const longUrl = `${local.url('/')}?q=${'y'.repeat(5000)}`
    const report = await scan(local.url('/'), {
      rules: [
        testRule({
          detect: () => [
            {
              message: 'found',
              values: {
                what: 'x'.repeat(10_000),
                list: Array.from({ length: 100 }, (_, i) => i),
                nested: { emoji: '😀'.repeat(2000) },
              },
              selector: `${'div > '.repeat(1000)}a`,
              url: longUrl,
            },
          ],
        }),
      ],
      policy: policyFor(local),
    })
    expect(schemaErrors(report)).toBe('')
    const evidence = report.findings[0]?.evidence
    const cut = `${'x'.repeat(MAX_VALUE_LENGTH - 1)}…`
    expect(evidence?.values?.what).toBe(cut)
    expect(report.findings[0]?.message.en).toBe(`Found ${cut}`)
    expect(evidence?.values?.list).toEqual(Array.from({ length: MAX_VALUE_ITEMS }, (_, i) => i))
    // A surrogate pair is never split.
    expect(evidence?.values?.nested).toEqual({ emoji: `${'😀'.repeat(MAX_VALUE_LENGTH / 2 - 1)}…` })
    // Selectors keep their most specific end.
    expect(evidence?.selector?.length).toBeLessThanOrEqual(MAX_SELECTOR_LENGTH)
    expect(evidence?.selector).toMatch(/^… > div > div > .* > div > a$/)
    expect(evidence?.url).toBe(`${longUrl.slice(0, MAX_VALUE_LENGTH - 1)}…`)
  })

  it('turns output that breaks the report schema into a rule error', async () => {
    const local = await site({ 'index.html': ARABIC_PAGE })
    const report = await scan(local.url('/'), {
      rules: [
        testRule({
          id: 'nan-rule',
          detect: () => [{ message: 'found', values: { what: Number.NaN } }],
        }),
        testRule({
          id: 'zero-line-rule',
          detect: () => [{ message: 'found', values: { what: 'x' }, location: { line: 0 } }],
        }),
        flagRule(),
      ],
      policy: policyFor(local),
    })
    expect(schemaErrors(report)).toBe('')
    expect(report.scan.status).toBe('partial')
    expect(report.rules.map((rule) => [rule.id, rule.status, rule.error])).toEqual([
      ['nan-rule', 'error', 'rule-failed'],
      ['test-rule', 'fail', undefined],
      ['zero-line-rule', 'error', 'rule-failed'],
    ])
    expect(report.findings.every((finding) => finding.ruleId === 'test-rule')).toBe(true)
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

  it('keeps robots.txt in the report only when a selected rule needs it', async () => {
    const local = await site({
      'index.html': ARABIC_PAGE,
      'robots.txt': 'User-agent: *\nDisallow: /\n',
    })
    const without = await scan(local.url('/'), { rules: [flagRule()], policy: policyFor(local) })
    // Read all the same, before the page: it may ask ArablyzerBot not to check it.
    expect(local.requests).toEqual(['GET /robots.txt', 'GET /'])
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

  // Security review 2026-09-24: under --allow-private, a chain that starts on a public address
  // loses private access. robots.txt is read first (M2.4 plan §2): the page's fetch for the same
  // site must not get private access back.
  it('keeps the lockdown robots.txt found when it fetches the page', async () => {
    const local = await site({ 'index.html': ARABIC_PAGE, 'robots.txt': 'User-agent: *\n' })
    let lookups = 0
    // The site's name resolves to the exact test target, standing in for a public site; by the
    // time the page is fetched, DNS points it at a loopback address only --allow-private opens.
    const resolver: Resolver = () => {
      lookups++
      return Promise.resolve([{ address: lookups === 1 ? '127.0.0.1' : '127.0.0.2', family: 4 }])
    }
    const report = await scan(`http://fixture.test:${local.port}/`, {
      rules: [robotsRule],
      policy: createPolicy({
        allowPrivate: true,
        allowTargets: [{ address: '127.0.0.1', port: local.port }],
      }),
      resolver,
    })
    expect(lookups).toBe(2)
    expect(local.requests).toEqual(['GET /robots.txt'])
    expect(report.scan.status).toBe('failed')
    expect(report.scan.notices.map((item) => item.code)).toEqual(['blocked-address'])
  })

  // The robots.txt of the site a redirect leads to keeps the page's lockdown too.
  it('keeps a public chain’s lockdown when it fetches robots.txt for another site', async () => {
    const final = await site({ 'final/index.html': ARABIC_PAGE, 'robots.txt': 'User-agent: *\n' })
    const first = await site(
      { 'robots.txt': 'User-agent: *\n' },
      { '/': { status: 301, headers: { location: `http://other.test:${final.port}/final/` } } },
    )
    let lookups = 0
    // Both names stand in for public sites, but for the lookup of the second one's robots.txt,
    // the third: there DNS points at a loopback address only --allow-private opens.
    const resolver: Resolver = () => {
      lookups++
      return Promise.resolve([{ address: lookups === 3 ? '127.0.0.2' : '127.0.0.1', family: 4 }])
    }
    const report = await scan(`http://fixture.test:${first.port}/`, {
      rules: [robotsRule],
      policy: createPolicy({
        allowPrivate: true,
        allowTargets: [first, final].map((one) => ({ address: '127.0.0.1', port: one.port })),
      }),
      resolver,
    })
    expect(lookups).toBe(4)
    expect(report.target.http.status).toBe(200)
    expect(final.requests).toEqual(['GET /final/'])
    expect(report.rules[0]).toMatchObject({ status: 'error', error: 'robots-unchecked' })
    expect(report.scan.notices.map((item) => item.code)).toEqual(['robots-unchecked'])
  })
})
