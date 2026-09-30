import { monitorEventLoopDelay } from 'node:perf_hooks'
import { gzipSync } from 'node:zlib'
import { collectPage, type SitemapFacts } from '@arablyzer/collectors'
import { createPolicy, type Resolver } from '@arablyzer/egress'
import { afterEach, describe, expect, it } from 'vitest'
import {
  evaluatePage,
  scan,
  SITEMAP_LIMIT,
  SITEMAP_MAX_BYTES,
  SITEMAP_MAX_REDIRECTS,
} from '../src/index'
import { policyFor, resolverFor, schemaErrors, tempSite, testRule, type TempSite } from './helpers'

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

const PAGE = '<!doctype html><html lang="ar" dir="rtl"><title>متجر</title><p>مرحبا</p></html>'
const NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9'
const URLSET = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${NAMESPACE}"><url><loc>http://shop.example/</loc></url></urlset>\n`
/** A public name the fixture server answers to, so robots.txt can name its own URLs. */
const SHOP = JSON.stringify({ host: 'shop.example' })

/** The sitemaps a rule sees, one finding each: what was fetched and what it held. */
let seen: SitemapFacts | undefined
const sitemapRule = testRule({
  id: 'sitemap-rule',
  needs: ['robots', 'sitemap'],
  // As a rule that needs each of them would: with none read, it has nothing to judge.
  // The facts it is given, whether it can judge them or not.
  appliesTo: (_page, evidence) => {
    seen = evidence?.sitemap
    return true
  },
  couldNotCheck: ({ sitemap }) =>
    sitemap !== undefined &&
    sitemap.checked.length > 0 &&
    sitemap.checked.every((check) => check.outcome === 'failed')
      ? 'sitemap-unchecked'
      : null,
  detect: () => [],
})

async function scanned(local: TempSite, options: Parameters<typeof scan>[1] = {}) {
  seen = undefined
  const report = await scan(local.url('/'), {
    rules: [sitemapRule],
    policy: policyFor(local),
    resolver: resolverFor(local),
    ...options,
  })
  expect(schemaErrors(report)).toBe('')
  return report
}

describe('scan: sitemaps', () => {
  it('reads the sitemaps robots.txt names, and /sitemap.xml only when it names none', async () => {
    const named = await site({
      'site.json': SHOP,
      'index.html': PAGE,
      'robots.txt': 'User-agent: *\nAllow: /\n\nSitemap: http://shop.example/ar/sitemap.xml\n',
      'ar/sitemap.xml': URLSET,
    })
    const report = await scanned(named)
    expect(report.rules[0]?.status).toBe('pass')
    expect(named.requests).toEqual(['GET /robots.txt', 'GET /', 'GET /ar/sitemap.xml'])
    expect(seen).toEqual({
      named: [{ value: `http://shop.example:${named.port}/ar/sitemap.xml`, line: 4 }],
      checked: [
        {
          outcome: 'fetched',
          url: `http://shop.example:${named.port}/ar/sitemap.xml`,
          named: true,
          status: 200,
          content: { kind: 'sitemap', format: 'urlset', entries: 1 },
          truncated: false,
        },
      ],
      unchecked: 0,
    })

    const unnamed = await site({ 'site.json': SHOP, 'index.html': PAGE })
    await scanned(unnamed)
    expect(unnamed.requests).toEqual(['GET /robots.txt', 'GET /', 'GET /sitemap.xml'])
    expect(seen?.checked).toEqual([
      {
        outcome: 'unavailable',
        url: `http://shop.example:${unnamed.port}/sitemap.xml`,
        named: false,
        status: 404,
      },
    ])
  })

  it('asks for nothing when no rule reads the sitemaps, or of a local site', async () => {
    const local = await site({ 'site.json': SHOP, 'index.html': PAGE })
    await scan(local.url('/'), {
      rules: [testRule({ id: 'robots-rule', needs: ['robots'], detect: () => [] })],
      policy: policyFor(local),
      resolver: resolverFor(local),
    })
    expect(local.requests).toEqual(['GET /robots.txt', 'GET /'])
    // Search engines reach public sites alone: a local one has nothing for these rules to judge.
    const development = await site({
      'index.html': PAGE,
      'robots.txt': 'Sitemap: https://example.com/sitemap.xml\n',
    })
    const report = await scanned(development)
    expect(report.rules[0]?.status).toBe('not-applicable')
    expect(report.scan.notices).toEqual([])
    expect(development.requests).toEqual(['GET /robots.txt', 'GET /'])
  })

  it(`fetches the first ${String(SITEMAP_LIMIT)} named, counts the rest, and follows no index`, async () => {
    const names = ['a', 'b', 'c', 'd', 'e']
    const index = `<sitemapindex xmlns="${NAMESPACE}"><sitemap><loc>http://shop.example/child.xml</loc></sitemap></sitemapindex>`
    const local = await site({
      'site.json': SHOP,
      'index.html': PAGE,
      'robots.txt': names.map((name) => `Sitemap: http://shop.example/${name}.xml\n`).join(''),
      ...Object.fromEntries(names.map((name) => [`${name}.xml`, index])),
    })
    await scanned(local)
    expect(local.requests).toEqual([
      'GET /robots.txt',
      'GET /',
      'GET /a.xml',
      'GET /b.xml',
      'GET /c.xml',
    ])
    expect(seen?.unchecked).toBe(2)
    expect(seen?.checked.map((check) => check.outcome === 'fetched' && check.content)).toEqual(
      Array(3).fill({ kind: 'sitemap', format: 'sitemapindex', entries: 1 }),
    )
  })

  it('runs whatever the page answered: the sitemaps are the site’s', async () => {
    const local = await site({ 'site.json': SHOP, 'sitemap.xml': URLSET }, { '/': { status: 404 } })
    const report = await scanned(local)
    expect(report.rules[0]?.status).toBe('pass')
    expect(seen?.checked[0]).toMatchObject({ outcome: 'fetched', status: 200 })
  })

  it('decompresses a gzipped sitemap, and no further than it reads', async () => {
    const local = await site({
      'site.json': SHOP,
      'index.html': PAGE,
      'robots.txt':
        'Sitemap: http://shop.example/sitemap.xml.gz\nSitemap: http://shop.example/bomb.xml.gz\n',
      'sitemap.xml.gz': gzipSync(URLSET),
      // A few kilobytes that would decompress past the read limit.
      'bomb.xml.gz': gzipSync(Buffer.alloc(SITEMAP_MAX_BYTES + 1024 * 1024, 0x20)),
    })
    const started = performance.now()
    await scanned(local)
    expect(performance.now() - started).toBeLessThan(10_000)
    expect(seen?.checked).toMatchObject([
      { content: { kind: 'sitemap', format: 'urlset', entries: 1 }, truncated: false },
      { content: { kind: 'sitemap', format: 'text', entries: null }, truncated: true },
    ])
  })

  // The bot's page says how many redirects it follows for a sitemap, from this number.
  it(`follows at most ${String(SITEMAP_MAX_REDIRECTS)} redirects to a sitemap`, async () => {
    const chain = (length: number) => ({
      files: { [`hop${String(length)}`]: URLSET },
      config: Object.fromEntries(
        Array.from({ length }, (_, index) => [
          `/hop${String(index)}`,
          { status: 301, headers: { location: `/hop${String(index + 1)}` } },
        ]),
      ),
    })
    for (const [length, outcome] of [
      [SITEMAP_MAX_REDIRECTS, 'fetched'],
      [SITEMAP_MAX_REDIRECTS + 1, 'failed'],
    ] as const) {
      const { files, config } = chain(length)
      const local = await site(
        {
          'site.json': SHOP,
          'index.html': PAGE,
          'robots.txt': 'Sitemap: http://shop.example/hop0\n',
          ...files,
        },
        config,
      )
      await scanned(local)
      expect(seen?.checked, String(length)).toMatchObject([
        outcome === 'failed' ? { outcome, code: 'too-many-redirects' } : { outcome },
      ])
    }
  })

  // M2.3c review: the spaces above are past the parser at once, so they proved the limit on what
  // is decompressed and nothing of the cost of reading it. What is small gzipped and costly to read
  // is not blank: attributes without end, elements without end, a value without end. Each of these
  // held the scanner's event loop for seconds to hours, or its memory for gigabytes.
  it.each([
    [
      'attributes',
      () =>
        `<urlset xmlns="${NAMESPACE}"` +
        Array.from({ length: 2_700_000 }, (_, index) => ` a${String(index)}=""`).join(''),
    ],
    ['nested elements', () => `<urlset xmlns="${NAMESPACE}">` + '<a>'.repeat(9_000_000)],
    ['one value', () => `<urlset xmlns="${NAMESPACE}" a="` + 'x'.repeat(SITEMAP_MAX_BYTES + 1024)],
  ])('reads a gzip bomb of %s in a moment, and never holds the event loop', async (_name, make) => {
    const bomb = gzipSync(make())
    const local = await site({
      'site.json': SHOP,
      'index.html': PAGE,
      'robots.txt': 'Sitemap: http://shop.example/bomb.xml.gz\n',
      'bomb.xml.gz': bomb,
    })
    const loop = monitorEventLoopDelay({ resolution: 10 })
    loop.enable()
    const started = performance.now()
    await scanned(local)
    const took = performance.now() - started
    loop.disable()
    // Read up to the scan's limit, and not as a sitemap: it is not XML that a search engine reads.
    expect(seen?.checked).toMatchObject([
      { outcome: 'fetched', content: { kind: 'not-xml' }, truncated: true },
    ])
    expect(took).toBeLessThan(10_000)
    // The watchdog timers of a scan run on this loop: nothing may keep it from them for long.
    expect(loop.max / 1e6).toBeLessThan(1_500)
  })

  // M2.3c review: a site that turns the scan away (or cannot answer) has not said its sitemap is
  // missing or broken. The statuses are those the report page calls refusals, and RFC 9309's rule
  // for a robots.txt that answers 5xx: it could not be checked.
  it.each([401, 403, 407, 429, 500, 502, 503, 504])(
    'reports a rule error, not a fault, when a sitemap answers HTTP %i',
    async (status) => {
      const named = await site(
        {
          'site.json': SHOP,
          'index.html': PAGE,
          'robots.txt': 'Sitemap: http://shop.example/s.xml\n',
        },
        { '/s.xml': { status, body: 'no' } },
      )
      const report = await scanned(named)
      expect(report.rules[0]).toMatchObject({ status: 'error', error: 'sitemap-unchecked' })
      expect(report.scan.notices.map((item) => item.code)).toEqual(['sitemap-unchecked'])
      expect(seen?.checked).toMatchObject([{ outcome: 'failed', code: 'refused', status }])
      // The same at /sitemap.xml, where robots.txt names none: the site is not called sitemap-less.
      const unnamed = await site(
        { 'site.json': SHOP, 'index.html': PAGE },
        { '/sitemap.xml': { status, body: 'no' } },
      )
      expect((await scanned(unnamed)).rules[0]).toMatchObject({
        status: 'error',
        error: 'sitemap-unchecked',
      })
    },
  )

  it.each([404, 410])(
    'still reports the fault when a sitemap answers HTTP %i, or an HTML page',
    async (status) => {
      const local = await site(
        {
          'site.json': SHOP,
          'index.html': PAGE,
          'robots.txt':
            'Sitemap: http://shop.example/gone.xml\nSitemap: http://shop.example/page.xml\n',
          'page.xml': PAGE,
        },
        { '/gone.xml': { status, body: 'gone' } },
      )
      const report = await scanned(local)
      expect(report.rules[0]?.status).toBe('pass')
      expect(seen?.checked).toMatchObject([
        { outcome: 'unavailable', status },
        { outcome: 'fetched', content: { kind: 'html' } },
      ])
    },
  )

  it('reports a rule error, not a verdict, when robots.txt cannot be read', async () => {
    const local = await site(
      { 'site.json': SHOP, 'index.html': PAGE },
      {
        '/robots.txt': { status: 503 },
      },
    )
    const report = await scanned(local)
    expect(report.rules[0]).toMatchObject({ status: 'error', error: 'sitemap-unchecked' })
    expect(report.scan.notices.map((item) => item.code)).toEqual(['sitemap-unchecked'])
    expect(local.requests).toEqual(['GET /robots.txt', 'GET /'])
  })

  it('reports a rule error, not a verdict, when a sitemap does not answer in time', async () => {
    const local = await site({
      'site.json': SHOP,
      'index.html': PAGE,
      'robots.txt': 'Sitemap: http://slow.example/sitemap.xml\n',
    })
    // The sitemap's site never answers, as DNS that never does: within the scan's own limit.
    const resolver: Resolver = (hostname, signal) =>
      hostname === 'slow.example'
        ? new Promise<never>(() => undefined)
        : resolverFor(local)(hostname, signal)
    const report = await scanned(local, { resolver, timeoutMs: 300 })
    expect(report.rules[0]).toMatchObject({ status: 'error', error: 'sitemap-unchecked' })
    expect(seen?.checked).toMatchObject([{ outcome: 'failed', code: 'timeout' }])
  })
})

// M2.3c review: one sitemap that could not be fetched threw away the verdicts on all the others,
// and on the Sitemap lines that need no fetch. Each is an outcome of its own now, with its reason.
describe('scan: sitemaps that could not all be read', () => {
  const RULES_HERE = ['sitemap-invalid', 'sitemap-missing']
  /** A name whose address is a private one, which the policy refuses without a request. */
  const BLOCKED = 'http://blocked.example/s.xml'
  const blocked =
    (local: TempSite): Resolver =>
    (hostname, signal) =>
      hostname === 'blocked.example'
        ? Promise.resolve([{ address: '10.0.0.7', family: 4 }])
        : resolverFor(local)(hostname, signal)

  async function realRules(local: TempSite) {
    seen = undefined
    const report = await scan(local.url('/'), {
      ruleIds: RULES_HERE,
      policy: policyFor(local),
      resolver: blocked(local),
    })
    expect(schemaErrors(report)).toBe('')
    return report
  }
  const statuses = (report: Awaited<ReturnType<typeof realRules>>) =>
    report.rules.map((rule) => [rule.id, rule.status, rule.error])

  it('judges the sitemaps it read, and says the one it could not read was not checked', async () => {
    const local = await site({
      'site.json': SHOP,
      'index.html': PAGE,
      'robots.txt': `Sitemap: ${BLOCKED}\nSitemap: http://shop.example/good.xml\nSitemap: http://shop.example/wrong.xml\n`,
      'good.xml': URLSET,
      'wrong.xml': '<urlset><url><loc>http://shop.example/</loc></url></urlset>',
    })
    const report = await realRules(local)
    expect(statuses(report)).toEqual([
      ['sitemap-invalid', 'fail', undefined],
      ['sitemap-missing', 'pass', undefined],
    ])
    expect(report.findings.map((finding) => finding.message.en)).toEqual([
      `The <urlset> element of http://shop.example:${local.port.toString()}/wrong.xml is not in the sitemaps protocol's namespace, http://www.sitemaps.org/schemas/sitemap/0.9.`,
    ])
    expect(report.scan.notices.map((item) => item.code)).toEqual(['sitemap-unchecked'])
    expect(local.requests).toEqual(['GET /robots.txt', 'GET /', 'GET /good.xml', 'GET /wrong.xml'])
  })

  it('reports an error only when none of the sitemaps could be read', async () => {
    const local = await site({
      'site.json': SHOP,
      'index.html': PAGE,
      'robots.txt': `Sitemap: ${BLOCKED}\nSitemap: http://blocked.example/t.xml\n`,
    })
    const report = await realRules(local)
    // What robots.txt names answers sitemap-missing; sitemap-invalid has nothing it could judge.
    expect(statuses(report)).toEqual([
      ['sitemap-invalid', 'error', 'sitemap-unchecked'],
      ['sitemap-missing', 'pass', undefined],
    ])
    expect(report.scan.status).toBe('partial')
    expect(report.scan.notices.map((item) => item.code)).toEqual(['sitemap-unchecked'])
  })

  it('still reports a Sitemap line that is not a URL, though the sitemap it names could not be read', async () => {
    const local = await site({
      'site.json': SHOP,
      'index.html': PAGE,
      'robots.txt': `Sitemap: ${BLOCKED}\nSitemap: /relative.xml\n`,
    })
    const report = await realRules(local)
    expect(statuses(report)).toEqual([
      ['sitemap-invalid', 'fail', undefined],
      ['sitemap-missing', 'pass', undefined],
    ])
    expect(report.findings.map((finding) => [finding.ruleId, finding.evidence.location])).toEqual([
      ['sitemap-invalid', { line: 2 }],
    ])
    expect(report.scan.notices.map((item) => item.code)).toEqual(['sitemap-unchecked'])
  })

  it('cannot say a site has no sitemap when /sitemap.xml could not be read', async () => {
    const local = await site(
      { 'site.json': SHOP, 'index.html': PAGE },
      { '/sitemap.xml': { status: 503, body: 'busy' } },
    )
    const report = await realRules(local)
    expect(statuses(report)).toEqual([
      ['sitemap-invalid', 'not-applicable', undefined],
      ['sitemap-missing', 'error', 'sitemap-unchecked'],
    ])
  })

  it('reads a gzip sitemap that will not decompress as the site’s fault: a compression error', async () => {
    const local = await site({
      'site.json': SHOP,
      'index.html': PAGE,
      'robots.txt': 'Sitemap: http://shop.example/broken.xml.gz\n',
      // The gzip signature, then bytes that are not a stream.
      'broken.xml.gz': Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0xff, 0xfe, 0xfd, 0xfc, 0xfb, 0xfa]),
    })
    const report = await realRules(local)
    expect(statuses(report)).toEqual([
      ['sitemap-invalid', 'fail', undefined],
      ['sitemap-missing', 'pass', undefined],
    ])
    expect(report.findings.map((finding) => finding.message.en)).toEqual([
      `http://shop.example:${local.port.toString()}/broken.xml.gz is a gzip file that cannot be decompressed.`,
    ])
    expect(report.scan.notices).toEqual([])
  })
})

// BUILD-PLAN §13 and M2.3 plan §4: the sitemaps are a new fetch path, vetted as robots.txt is.
describe('scan: sitemaps, against SSRF', () => {
  // Nothing listens at these addresses, so a fetch that skipped egress would fail too, and the
  // scan would look the same. The reason is what tells: the policy refused it, by the rule that
  // applies (M2.3c review).
  it.each([
    [
      'names a metadata address',
      'Sitemap: http://169.254.169.254/sitemap.xml\n',
      {},
      'blocked-address',
    ],
    ['names a private address', 'Sitemap: http://10.0.0.7/sitemap.xml\n', {}, 'blocked-address'],
    ['names a local name', 'Sitemap: http://localhost/sitemap.xml\n', {}, 'blocked-host'],
    [
      'names another port',
      'Sitemap: http://shop.example:6379/sitemap.xml\n',
      {},
      'port-not-allowed',
    ],
    [
      'names a sitemap that redirects to a metadata address',
      'Sitemap: http://shop.example/sitemap.xml\n',
      {
        '/sitemap.xml': {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        },
      },
      'blocked-address',
    ],
  ])(
    'refuses it, and names no address, when robots.txt %s',
    async (_name, robots, config, code) => {
      const local = await site(
        { 'site.json': SHOP, 'index.html': PAGE, 'robots.txt': robots },
        config,
      )
      const report = await scanned(local)
      expect(seen?.checked).toMatchObject([{ outcome: 'failed', code }])
      expect(report.scan.status).toBe('partial')
      expect(report.rules[0]).toMatchObject({ status: 'error', error: 'sitemap-unchecked' })
      expect(report.scan.notices.map((item) => item.code)).toEqual(['sitemap-unchecked'])
      const text = JSON.stringify(report)
      for (const address of ['169.254', '10.0.0.7', 'localhost', '6379']) {
        expect(text).not.toContain(address)
      }
    },
  )

  // A service that would answer, on a port the policy does not open: whatever reached it shows.
  describe('with a service listening where the policy does not let the scan', () => {
    const listener = () => site({ 'sitemap.xml': URLSET })
    const open = (...ports: number[]) =>
      createPolicy({ allowTargets: ports.map((port) => ({ address: '127.0.0.1', port })) })

    it.each([
      [
        'names it',
        (forbidden: TempSite) => ({ robots: `Sitemap: ${forbidden.url('/sitemap.xml')}\n` }),
      ],
      [
        'names a name that resolves to it',
        (forbidden: TempSite) => ({
          robots: `Sitemap: http://shop.example:${String(forbidden.port)}/sitemap.xml\n`,
        }),
      ],
      [
        'names a sitemap that redirects to it',
        (forbidden: TempSite) => ({
          robots: 'Sitemap: http://shop.example/sitemap.xml\n',
          config: {
            '/sitemap.xml': {
              status: 302,
              headers: { location: forbidden.url('/sitemap.xml') },
            },
          },
        }),
      ],
    ])('is not reached when robots.txt %s', async (_name, plan) => {
      const forbidden = await listener()
      const { robots, config } = plan(forbidden) as {
        robots: string
        config?: Parameters<typeof tempSite>[1]
      }
      const local = await site(
        { 'site.json': SHOP, 'index.html': PAGE, 'robots.txt': robots },
        config,
      )
      await scanned(local, { policy: open(local.port) })
      expect(seen?.checked).toMatchObject([
        { outcome: 'failed', code: expect.any(String) as string },
      ])
      expect(seen?.checked[0]).toMatchObject({ outcome: 'failed' })
      // Not its robots.txt, nor the sitemap: nothing.
      expect(forbidden.requests).toEqual([])
    })

    it('is reached when the policy lets the scan, so that nothing arriving above is the listener’s doing', async () => {
      const forbidden = await listener()
      const local = await site({
        'site.json': SHOP,
        'index.html': PAGE,
        'robots.txt': `Sitemap: http://shop.example:${String(forbidden.port)}/sitemap.xml\n`,
      })
      await scanned(local, { policy: open(local.port, forbidden.port) })
      expect(seen?.checked).toMatchObject([{ outcome: 'fetched', status: 200 }])
      expect(forbidden.requests).toEqual(['GET /robots.txt', 'GET /sitemap.xml'])
    })
  })

  it('keeps a redirect of /sitemap.xml within the policy', async () => {
    const local = await site(
      { 'site.json': SHOP, 'index.html': PAGE },
      {
        '/sitemap.xml': { status: 301, headers: { location: 'http://127.0.0.1:6379/' } },
      },
    )
    const report = await scanned(local)
    expect(seen?.checked).toMatchObject([{ outcome: 'failed', code: 'port-not-allowed' }])
    expect(report.rules[0]).toMatchObject({ status: 'error', error: 'sitemap-unchecked' })
    expect(local.requests).toEqual(['GET /robots.txt', 'GET /', 'GET /sitemap.xml'])
  })

  // Security review 2026-09-24, as for robots.txt: under --allow-private, a chain that starts on a
  // public address keeps the default rules for everything the scan fetches for the same site.
  it('keeps the lockdown the page’s chain ended with', async () => {
    const local = await site({
      'site.json': SHOP,
      'index.html': PAGE,
      'robots.txt': 'Sitemap: http://shop.example/sitemap.xml\n',
      'sitemap.xml': URLSET,
    })
    let lookups = 0
    // The name stands in for a public site; by the time the sitemap is fetched, DNS points it at a
    // loopback address that only --allow-private opens.
    const resolver: Resolver = () => {
      lookups++
      return Promise.resolve([{ address: lookups <= 2 ? '127.0.0.1' : '127.0.0.2', family: 4 }])
    }
    const report = await scanned(local, {
      policy: createPolicy({
        allowPrivate: true,
        allowTargets: [{ address: '127.0.0.1', port: local.port }],
      }),
      resolver,
    })
    expect(lookups).toBe(3)
    expect(local.requests).toEqual(['GET /robots.txt', 'GET /'])
    expect(seen?.checked).toMatchObject([{ outcome: 'failed', code: 'blocked-address' }])
    expect(report.rules[0]).toMatchObject({ status: 'error', error: 'sitemap-unchecked' })
  })

  // A sitemap is a request of the scan's own, made as a crawler would, like a link: on its site, a
  // group naming the bot counts, and `User-agent: *` where none names it (RFC 9309 §2.2.1).
  it.each(['ArablyzerBot', '*'])(
    "reads the robots.txt of the site a sitemap is on first, and keeps a %s group's Disallow",
    async (agent) => {
      const other = await site({
        'site.json': JSON.stringify({ host: 'sitemaps.example' }),
        'robots.txt': `User-agent: ${agent}\nDisallow: /private/\n`,
        'shop.xml': URLSET,
        'private/shop.xml': URLSET,
      })
      const shop = (robots: string) =>
        site({ 'site.json': SHOP, 'index.html': PAGE, 'robots.txt': robots })
      const both: Resolver = (hostname) =>
        Promise.resolve(
          ['shop.example', 'sitemaps.example'].includes(hostname)
            ? [{ address: '127.0.0.1', family: 4 }]
            : [],
        )
      const scanWith = async (local: TempSite) => {
        seen = undefined
        return scan(local.url('/'), {
          rules: [sitemapRule],
          policy: createPolicy({
            allowTargets: [local, other].map((one) => ({ address: '127.0.0.1', port: one.port })),
          }),
          resolver: both,
        })
      }

      const allowed = await shop(`Sitemap: ${other.url('/shop.xml')}\n`)
      expect((await scanWith(allowed)).rules[0]?.status).toBe('pass')
      expect(other.requests).toEqual(['GET /robots.txt', 'GET /shop.xml'])
      expect(seen?.checked[0]).toMatchObject({ outcome: 'fetched', url: other.url('/shop.xml') })

      const declined = await shop(`Sitemap: ${other.url('/private/shop.xml')}\n`)
      const report = await scanWith(declined)
      expect(seen?.checked).toMatchObject([{ outcome: 'failed', code: 'opted-out' }])
      expect(report.rules[0]).toMatchObject({ status: 'error', error: 'sitemap-unchecked' })
      // Each scan reads that site's robots.txt afresh, and the file it keeps the bot from never.
      expect(other.requests.slice(2)).toEqual(['GET /robots.txt'])
    },
  )
})

describe('evaluatePage: sitemaps', () => {
  const page = collectPage({
    url: 'https://shop.example/',
    status: 200,
    headers: [['content-type', 'text/html; charset=utf-8']],
    body: new TextEncoder().encode(PAGE),
  })
  const robots = {
    outcome: 'fetched',
    url: 'https://shop.example/robots.txt',
    status: 200,
    robots: { groups: [], sitemaps: [] },
    truncated: false,
  } as const

  it('leaves a rule that reads the sitemaps nothing to judge without them', () => {
    expect(evaluatePage(page, { rules: [sitemapRule], robots }).results[0]).toMatchObject({
      status: 'not-applicable',
    })
    const sitemap: SitemapFacts = { named: [], checked: [], unchecked: 0 }
    expect(evaluatePage(page, { rules: [sitemapRule], robots, sitemap }).results[0]).toMatchObject({
      status: 'pass',
    })
    expect(seen).toBe(sitemap)
  })
})
