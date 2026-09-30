import {
  collectPage,
  MAX_SITE_LINKS,
  parseRobotsTxt,
  REFUSAL_STATUSES,
  type LinkCheck,
} from '@arablyzer/collectors'
import { robotsMatcher, type Rule } from '@arablyzer/rules'
import { afterEach, describe, expect, it } from 'vitest'
import { checkLinks, CONCURRENCY, MAX_LINKS } from '../src/links'
import { evaluatePage, scan } from '../src/index'
import { serveSite } from '@arablyzer/fixtures'
import { FIXTURE_CASES } from './fixture-cases'
import { policyFor, schemaErrors, tempSite, testRule, type TempSite } from './helpers'

// M2.3c: the page's links to its own site, each asked for once, HEAD then GET where HEAD answers
// an error, for the rules that read them, and for no other scan.

/** A rule that reads the links' checks, and finds each link that answered 4xx or 5xx. */
const linkRule: Rule<'found'> = testRule({
  id: 'link-rule',
  needs: ['html', 'links'],
  appliesTo: (_page, evidence) => (evidence?.links?.total ?? 0) > 0,
  detect: ({ links }) =>
    (links?.checks ?? []).flatMap((check) =>
      check.outcome === 'answered' && check.status >= 400
        ? [
            {
              message: 'found' as const,
              values: { what: `${check.method} ${String(check.status)} ${check.url}` },
              key: check.url,
            },
          ]
        : [],
    ),
})

const page = (links: string) =>
  `<!doctype html><html lang="ar" dir="rtl"><title>متجر</title><body>${links}</body></html>`

describe('scan: the page’s links to its own site', () => {
  let site: TempSite | undefined

  afterEach(async () => {
    await site?.close()
    site = undefined
  })

  const run = async (local: TempSite, rules: readonly Rule[] = [linkRule]) =>
    scan(local.url('/'), { rules, policy: policyFor(local) })

  it('asks for each once, HEAD then GET where HEAD answers an error, and follows no redirect', async () => {
    site = await tempSite(
      {
        'index.html': page(`
          <a href="/ar/offers/">العروض</a>
          <a href="/ar/offers/#top">العروض</a>
          <a href="/ar/missing/">مفقودة</a>
          <a href="/ar/old/">قديمة</a>
          <a href="/ar/down/">معطلة</a>
          <a href="/ar/no-head/">بلا HEAD</a>
          <a href="/">الرئيسية</a>`),
        'ar/offers/index.html': page('<p>العروض</p>'),
        'ar/no-head/index.html': page('<p>صفحة</p>'),
      },
      {
        '/ar/old/': { status: 301, headers: { location: '/ar/elsewhere/' } },
        '/ar/down/': { status: 500 },
        '/ar/no-head/': { headStatus: 405 },
      },
    )
    const report = await run(site)
    expect(schemaErrors(report)).toBe('')
    expect(report.scan).toMatchObject({ status: 'complete', notices: [] })
    expect(report.rules.map((rule) => [rule.id, rule.status])).toEqual([['link-rule', 'fail']])
    expect(report.findings.map((finding) => finding.evidence.values?.what)).toEqual([
      `GET 404 ${site.url('/ar/missing/')}`,
      `GET 500 ${site.url('/ar/down/')}`,
    ])
    expect(site.requests.slice(0, 2)).toEqual(['GET /robots.txt', 'GET /'])
    expect([...site.requests.slice(2)].sort()).toEqual(
      [
        'HEAD /ar/offers/',
        'HEAD /ar/missing/',
        'GET /ar/missing/',
        'HEAD /ar/old/',
        'HEAD /ar/down/',
        'GET /ar/down/',
        'HEAD /ar/no-head/',
        'GET /ar/no-head/',
      ].sort(),
    )
  })

  it('checks the first links alone, and says how many it left', async () => {
    const links = Array.from(
      { length: MAX_LINKS + 5 },
      (_, index) => `<a href="/p/${String(index)}">${String(index)}</a>`,
    ).join('')
    site = await tempSite({ 'index.html': page(links) })
    const report = await run(site)
    expect(site.requests.filter((request) => request.startsWith('HEAD '))).toHaveLength(MAX_LINKS)
    expect(site.requests).not.toContain(`HEAD /p/${String(MAX_LINKS)}`)
    expect(report.scan.notices.map((notice) => [notice.code, notice.message.en])).toEqual([
      [
        'links-limit',
        `The page links to ${String(MAX_LINKS + 5)} addresses on its own site: the scan checked the first ${String(MAX_LINKS)}, and not the other 5.`,
      ],
    ])
  })

  it('never asks for a link in a path robots.txt keeps ArablyzerBot from', async () => {
    site = await tempSite({
      'index.html': page('<a href="/ar/private/x">خاص</a><a href="/ar/open/">عام</a>'),
      'robots.txt':
        'User-agent: *\nDisallow: /\n\nUser-agent: ArablyzerBot\nDisallow: /ar/private/\n',
    })
    const report = await run(site)
    expect(site.requests).not.toContain('HEAD /ar/private/x')
    expect(site.requests).toContain('HEAD /ar/open/')
    expect(report.scan.notices.map((notice) => notice.code)).toEqual(['links-robots'])
    expect(report.scan.notices[0]?.message.en).toContain('ArablyzerBot')
  })

  // M2.3c review: the page is the visit someone asked for, so a `*` group alone does not stop it;
  // its links are not, so they follow the `*` group as a crawler's requests do.
  it('never asks for a link in a path robots.txt keeps every crawler from, but still scans the page', async () => {
    site = await tempSite({
      'index.html': page('<a href="/ar/private/x">خاص</a><a href="/ar/open/">عام</a>'),
      'robots.txt': 'User-agent: *\nDisallow: /ar/private/\n',
    })
    const report = await run(site)
    expect(site.requests).toContain('GET /')
    expect(site.requests).not.toContain('HEAD /ar/private/x')
    expect(site.requests).not.toContain('GET /ar/private/x')
    expect(site.requests).toContain('HEAD /ar/open/')
    expect(report.scan.notices.map((notice) => notice.code)).toEqual(['links-robots'])
    const message = report.scan.notices[0]?.message.en ?? ''
    expect(message).toContain('User-agent: *')
    expect(report.scan.notices[0]?.message.ar).toContain('User-agent: *')
  })

  it('asks for every link when the * group is all robots.txt has, and the page is not kept from the bot', async () => {
    site = await tempSite({
      'index.html': page('<a href="/ar/a/">أ</a><a href="/ar/b/">ب</a>'),
      'robots.txt': 'User-agent: *\nAllow: /\n',
    })
    const report = await run(site)
    expect(site.requests).toContain('HEAD /ar/a/')
    expect(site.requests).toContain('HEAD /ar/b/')
    expect(report.scan.notices.map((notice) => notice.code)).toEqual([])
  })

  it('does not judge a link that asks for fewer requests, and errs when none answered', async () => {
    site = await tempSite(
      { 'index.html': page('<a href="/ar/busy/">مشغولة</a>') },
      { '/ar/busy/': { status: 429 } },
    )
    const report = await run(site)
    expect(report.rules.map((rule) => [rule.id, rule.status, rule.error])).toEqual([
      ['link-rule', 'error', 'links-unchecked'],
    ])
    expect(report.scan).toMatchObject({ status: 'partial' })
    expect(report.scan.notices.map((notice) => notice.code)).toEqual(['links-unanswered'])
  })

  it('asks for no link when no rule reads them, and none for a page without any', async () => {
    site = await tempSite({ 'index.html': page('<a href="/ar/offers/">العروض</a>') })
    await run(site, [testRule({ detect: () => [] })])
    expect(site.requests).toEqual(['GET /robots.txt', 'GET /'])
    await site.close()
    site = await tempSite({ 'index.html': page('<a href="https://elsewhere.example/">خارج</a>') })
    const report = await run(site)
    expect(report.rules.map((rule) => rule.status)).toEqual(['not-applicable'])
    expect(site.requests).toEqual(['GET /robots.txt', 'GET /'])
  })
})

describe('evaluatePage: links', () => {
  it('finds the rules that read links not applicable, having no checks to read', () => {
    const facts = collectPage({
      url: 'https://shop.example/',
      status: 200,
      headers: [['content-type', 'text/html; charset=utf-8']],
      body: new TextEncoder().encode(page('<a href="/x">x</a>')),
    })
    expect(evaluatePage(facts, { rules: [linkRule] }).results[0]?.status).toBe('not-applicable')
  })
})

// M2.3c review: a page of a hundred thousand links and a robots.txt of ten thousand rules took a
// scan 65 seconds of synchronous work, during which no timer, abort signal or health check could
// fire. A scan now counts a bounded number of links, tests robots.txt for those it asks for
// alone, and gives the event loop back while it chooses.
describe('checkLinks: hostile pages', () => {
  let site: TempSite | undefined

  afterEach(async () => {
    await site?.close()
    site = undefined
  })

  const anchors = (count: number) =>
    Array.from({ length: count }, (_, index) => `<a href="/p/${String(index)}">x</a>`).join('')
  const robotsWith = (rules: number, pattern: (index: number) => string) =>
    parseRobotsTxt(
      new TextEncoder().encode(
        ['User-agent: *', ...Array.from({ length: rules }, (_, i) => pattern(i))].join('\n'),
      ),
    )

  it('tests robots.txt for the links it asks for alone: 100,000 links, 10,000 rules', async () => {
    site = await tempSite({ 'index.html': page('<p>نص</p>') })
    const facts = collectPage({
      url: site.url('/'),
      status: 200,
      headers: [['content-type', 'text/html; charset=utf-8']],
      body: new TextEncoder().encode(page(anchors(100_000))),
    })
    const match = robotsMatcher(
      robotsWith(10_000, (index) => `Disallow: /x${String(index)}*y*z`),
      'ArablyzerBot',
    )
    let tested = 0
    const started = performance.now()
    const checked = await checkLinks(facts, {
      base: { userAgent: 'ArablyzerBot/1.0', policy: policyFor(site) },
      optedOut: (url) => {
        tested++
        return !match(url).allowed
      },
    })
    // It took 65 s before: now it tests the 50 it asks for, and counts the rest.
    expect(performance.now() - started).toBeLessThan(10_000)
    expect(tested).toBe(MAX_LINKS)
    expect(checked.checks).toHaveLength(MAX_LINKS)
    expect(checked).toMatchObject({
      total: MAX_SITE_LINKS,
      more: true,
      skipped: { limit: MAX_SITE_LINKS - MAX_LINKS, robots: 0 },
    })
  }, 60_000)

  it('leaves the event loop free while it chooses among links robots.txt keeps the bot from', async () => {
    site = await tempSite({ 'index.html': page('<p>نص</p>') })
    const facts = collectPage({
      url: site.url('/'),
      status: 200,
      headers: [['content-type', 'text/html; charset=utf-8']],
      body: new TextEncoder().encode(page(anchors(2 * MAX_SITE_LINKS))),
    })
    // Every link is kept from the bot, so every counted link is tested against every rule.
    const match = robotsMatcher(
      robotsWith(20_000, (index) =>
        index === 0 ? 'Disallow: /p/' : `Disallow: /x${String(index)}*y*z`,
      ),
      'ArablyzerBot',
    )
    // A timer that fires every 10 ms: the longest wait between two of its ticks is the longest
    // stretch the event loop was held.
    let last = performance.now()
    let worst = 0
    const timer = setInterval(() => {
      const now = performance.now()
      worst = Math.max(worst, now - last)
      last = now
    }, 10)
    const started = performance.now()
    const checked = await checkLinks(facts, {
      base: { userAgent: 'ArablyzerBot/1.0', policy: policyFor(site) },
      optedOut: (url) => !match(url).allowed,
    })
    clearInterval(timer)
    // The stretch since the last tick counts too: a loop held to the end ticks no more.
    worst = Math.max(worst, performance.now() - last)
    expect(checked).toMatchObject({
      total: MAX_SITE_LINKS,
      more: true,
      checks: [],
      skipped: { limit: 0, robots: MAX_SITE_LINKS },
    })
    // The work is long enough to matter, and no stretch of it held the loop.
    expect(performance.now() - started).toBeGreaterThan(200)
    expect(worst).toBeLessThan(500)
  }, 60_000)

  it('stops choosing when the scan is cancelled', async () => {
    site = await tempSite({ 'index.html': page('<p>نص</p>') })
    const facts = collectPage({
      url: site.url('/'),
      status: 200,
      headers: [['content-type', 'text/html; charset=utf-8']],
      body: new TextEncoder().encode(page(anchors(MAX_SITE_LINKS))),
    })
    const controller = new AbortController()
    let tested = 0
    const checked = await checkLinks(facts, {
      base: { userAgent: 'ArablyzerBot/1.0', policy: policyFor(site), signal: controller.signal },
      optedOut: () => {
        tested++
        if (tested === 10) controller.abort()
        return true
      },
    })
    expect(tested).toBeLessThan(MAX_SITE_LINKS)
    expect(checked.checks).toEqual([])
  })
})

describe('scan: a hostile page', () => {
  let site: TempSite | undefined

  afterEach(async () => {
    await site?.close()
    site = undefined
  })

  it('asks for the first links alone, whatever the page and its robots.txt hold', async () => {
    const links = Array.from(
      { length: 100_000 },
      (_, index) => `<a href="/p/${String(index)}">x</a>`,
    ).join('')
    const rules = Array.from({ length: 10_000 }, (_, i) => `Disallow: /x${String(i)}*y*z`)
    site = await tempSite({
      'index.html': page(links),
      'robots.txt': ['User-agent: *', ...rules].join('\n'),
    })
    const started = performance.now()
    const report = await scan(site.url('/'), { rules: [linkRule], policy: policyFor(site) })
    expect(performance.now() - started).toBeLessThan(20_000)
    expect(schemaErrors(report)).toBe('')
    expect(site.requests.filter((request) => request.startsWith('HEAD '))).toHaveLength(MAX_LINKS)
    expect(report.scan.notices.map((notice) => [notice.code, notice.message.en])).toEqual([
      [
        'links-limit-more',
        `The page links to at least ${String(MAX_SITE_LINKS)} addresses on its own site: the scan checked the first ${String(MAX_LINKS)}, and not the other ${String(MAX_SITE_LINKS - MAX_LINKS)} or more.`,
      ],
    ])
  }, 60_000)
})

// M2.3c review: a site that takes the check for a bot answers 401, 403, 407, 429 or 503, as it does
// a visitor it takes for one. That is no answer about the link, so no link is broken for it.
describe('checkLinks: a site that takes the check for a bot', () => {
  let site: TempSite | undefined

  afterEach(async () => {
    await site?.close()
    site = undefined
  })

  const pageOf = (local: TempSite, paths: readonly string[]) =>
    collectPage({
      url: local.url('/'),
      status: 200,
      headers: [['content-type', 'text/html; charset=utf-8']],
      body: new TextEncoder().encode(page(paths.map((path) => `<a href="${path}">x</a>`).join(''))),
    })
  const check = (local: TempSite, paths: readonly string[], timeoutMs?: number) =>
    checkLinks(pageOf(local, paths), {
      base: {
        userAgent: 'ArablyzerBot/1.0',
        policy: policyFor(local),
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      },
      optedOut: () => false,
    })
  const outcome = (check: LinkCheck | undefined) =>
    check?.outcome === 'answered'
      ? `${check.method} ${String(check.status)}`
      : `unanswered ${check?.reason ?? ''}`

  it('reads 401, 403, 407 and 503 as a refusal, and any other error as the link’s own', async () => {
    const refusing = [...REFUSAL_STATUSES].filter((status) => status !== 429)
    expect(refusing).toEqual([401, 403, 407, 503])
    const paths = ['/ar/a/', '/ar/b/', '/ar/c/', '/ar/d/', '/ar/e/', '/ar/f/', '/ar/g/']
    site = await tempSite(
      { 'index.html': page('<p>نص</p>'), 'ar/g/index.html': page('<p>صفحة</p>') },
      {
        '/ar/a/': { status: 401 },
        '/ar/b/': { status: 403 },
        '/ar/c/': { status: 407 },
        '/ar/d/': { status: 503 },
        '/ar/e/': { status: 404 },
        '/ar/f/': { status: 500 },
      },
    )
    const facts = await check(site, paths)
    expect(facts.checks.map(outcome)).toEqual([
      'unanswered refused',
      'unanswered refused',
      'unanswered refused',
      'unanswered refused',
      'GET 404',
      'GET 500',
      'HEAD 200',
    ])
    // A refusal is asked with GET too, as a visitor's browser asks: HEAD may be all that is refused.
    expect(site.requests).toContain('GET /ar/a/')
    expect(site.requests).toContain('GET /ar/d/')
  })

  it('takes the answer of GET where HEAD alone is refused', async () => {
    site = await tempSite(
      { 'index.html': page('<p>نص</p>'), 'ar/a/index.html': page('<p>صفحة</p>') },
      { '/ar/a/': { headStatus: 403 } },
    )
    const facts = await check(site, ['/ar/a/'])
    expect(facts.checks.map(outcome)).toEqual(['GET 200'])
  })

  it('stops asking after the first 429, and marks the links left as rate-limited', async () => {
    const paths = Array.from({ length: MAX_LINKS }, (_, index) => `/p/${String(index)}`)
    site = await tempSite(
      { 'index.html': page('<p>نص</p>') },
      Object.fromEntries(paths.map((path) => [path, { status: 429 }])),
    )
    const facts = await check(site, paths)
    const asked = site.requests.filter((request) => request.includes('/p/'))
    // Only the requests already on their way when the first 429 came, and never a GET after one.
    expect(asked.length).toBeGreaterThanOrEqual(1)
    expect(asked.length).toBeLessThanOrEqual(CONCURRENCY)
    expect(asked.every((request) => request.startsWith('HEAD '))).toBe(true)
    const outcomes = facts.checks.map(outcome)
    expect(outcomes).toHaveLength(MAX_LINKS)
    expect(outcomes.filter((each) => each === 'unanswered refused')).toHaveLength(asked.length)
    expect(outcomes.filter((each) => each === 'unanswered rate-limited')).toHaveLength(
      MAX_LINKS - asked.length,
    )
  })

  it('asks GET where HEAD fails to connect, and not where it times out', async () => {
    site = await tempSite(
      {
        'index.html': page('<p>نص</p>'),
        'ar/ok/index.html': page('<p>صفحة</p>'),
      },
      {
        '/ar/ok/': { headDrop: 'reset' },
        '/ar/gone/': { headDrop: 'reset' },
        '/ar/slow/': { headDrop: 'silence' },
      },
    )
    const facts = await check(site, ['/ar/ok/', '/ar/gone/', '/ar/slow/'], 300)
    expect(facts.checks.map(outcome)).toEqual(['GET 200', 'GET 404', 'unanswered timeout'])
    expect(site.requests).toContain('GET /ar/gone/')
    expect(site.requests).not.toContain('GET /ar/slow/')
  })
})

describe('scan: refusals are not broken links', () => {
  let site: TempSite | undefined

  afterEach(async () => {
    await site?.close()
    site = undefined
  })

  it('leaves them unjudged, and says how many, in the notice’s words', async () => {
    site = await tempSite(
      {
        'index.html': page(
          '<a href="/ar/members/">أ</a><a href="/ar/shop/">ب</a><a href="/ar/gone/">ج</a><a href="/ar/ok/">د</a>',
        ),
        'ar/ok/index.html': page('<p>صفحة</p>'),
      },
      { '/ar/members/': { status: 401 }, '/ar/shop/': { status: 503 } },
    )
    const report = await scan(site.url('/'), { rules: [linkRule], policy: policyFor(site) })
    expect(report.findings.map((finding) => finding.evidence.values?.what)).toEqual([
      `GET 404 ${site.url('/ar/gone/')}`,
    ])
    expect(report.scan.notices.map((notice) => notice.code)).toEqual(['links-unanswered'])
    const message = report.scan.notices[0]?.message.en ?? ''
    expect(message).toContain('2 of the page’s links')
    // The statuses the message names are those the engine reads as a refusal.
    for (const status of REFUSAL_STATUSES) expect(message).toContain(String(status))
    expect(report.scan.notices[0]?.message.ar).toContain('2')
    for (const status of REFUSAL_STATUSES)
      expect(report.scan.notices[0]?.message.ar).toContain(String(status))
  })
})

// M2.3c review: the rules' tests read link-broken's fixtures without HTTP (packages/rules,
// test/helpers.ts), with the classification the engine uses. The engine checks the same fixtures
// over HTTP here; the expected checks are those the rules' tests expect of the same fixtures.
describe('checkLinks: the link-broken fixtures, over HTTP', () => {
  const expected: Readonly<Record<string, readonly string[]>> = {
    right: ['HEAD 200', 'HEAD 200', 'HEAD 301', 'GET 200'],
    'right-refused': [
      'HEAD 200',
      'unanswered refused',
      'unanswered refused',
      'unanswered refused',
      'GET 200',
    ],
  }

  it.each(Object.entries(expected))(
    '%s ends its checks as the rules’ tests expect',
    async (name, checks) => {
      const fixture = FIXTURE_CASES.find(
        (each) => each.ruleId === 'link-broken' && each.fixture === name,
      )
      if (fixture === undefined) throw new Error(`no link-broken fixture ${name}`)
      const served = await serveSite(fixture.dir)
      try {
        let seen: readonly LinkCheck[] = []
        const capture = testRule({
          id: 'capture',
          needs: ['html', 'links'],
          detect: ({ links }) => {
            seen = links?.checks ?? []
            return []
          },
        })
        await scan(served.url('/'), { rules: [capture], policy: policyFor(served) })
        expect(
          seen.map((check) =>
            check.outcome === 'answered'
              ? `${check.method} ${String(check.status)}`
              : `unanswered ${check.reason}`,
          ),
        ).toEqual(checks)
      } finally {
        await served.close()
      }
    },
  )
})
