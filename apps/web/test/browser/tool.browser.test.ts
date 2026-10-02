import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { executablePathFor } from '@arablyzer/browser/engines'
import { createPolicy } from '@arablyzer/egress'
import { scan, summarize } from '@arablyzer/engine'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import { REPORT } from '@arablyzer/i18n/report'
import { TOOL_APP } from '@arablyzer/i18n/tool-app'
import { Report, type Engine, type RuleResult } from '@arablyzer/report-schema'
import { ruleById } from '@arablyzer/rules'
import type { Lang } from '@arablyzer/seo/site'
import { chromium, firefox, webkit, type Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// A tool page's tool (M2.2) as a visitor uses it, in the browsers: an address typed, the scan
// asked for with the tool's slug, and the result at the head of the main column, beside the box in
// the aside (M2.6 R7: the two are islands of one page). The API is stood in for, and
// the reports are real: the RTL checker's two rules, run by the engine on pages served here,
// one that fails a rule, one that passes both, one too complex to read in the time given (a
// partial scan), and an address nothing answers (a failed scan, with its report). The browsers
// open the site's own pages on loopback, and every request off the site is refused, so nothing
// leaves the machine (eslint.config.js). `pnpm test:browser` builds the site first. The Gulf payment
// methods detector's rule only lists what a page shows (information, M2.3c review): its result
// counts notes, never problems.
const DIST = fileURLToPath(new URL('../../dist/', import.meta.url))
const TOOL = 'rtl-check'
const RULES = ['rtl-html-dir', 'ar-html-lang']
/** A tool of one information rule: it lists the payment methods a page shows, and judges nothing. */
const LISTING_TOOL = 'payment-methods-detector'
const LISTING_RULES = ['payment-methods']
const ID = 'ToolToolToolToolTool_3'
const ADDRESS = 'https://store.example/'

const TYPES = { chromium, firefox, webkit } as const

/**
 * Every engine that launches here. Engines named in ARABLYZER_REQUIRE_ENGINES (CI names all
 * three) must launch, so a missing one fails the run instead of being skipped.
 */
async function enginesHere(): Promise<Engine[]> {
  const required = (process.env.ARABLYZER_REQUIRE_ENGINES ?? '').split(',').map((e) => e.trim())
  const engines: Engine[] = []
  for (const engine of ['chromium', 'firefox', 'webkit'] as const) {
    try {
      const executablePath = executablePathFor(engine)
      await (
        await TYPES[engine].launch({ ...(executablePath === undefined ? {} : { executablePath }) })
      ).close()
      engines.push(engine)
    } catch {
      if (required.includes(engine)) {
        throw new Error(`${engine} is required by ARABLYZER_REQUIRE_ENGINES but does not launch`)
      }
    }
  }
  return engines
}

const ENGINES = await enginesHere()

const page = (dir: string, body: string) =>
  `<!doctype html>\n<html lang="ar"${dir}>\n<head><meta charset="utf-8"><title>متجر العطور</title></head>\n<body><h1>متجر العطور</h1>${body}</body>\n</html>\n`
const TEXT = '<p>عطور عربية أصيلة، وتوصيل إلى كل مدن الخليج.</p>'

let pagesRoot = ''
let pages: FixtureSite
let site: FixtureSite
/**
 * The security headers tool judges four rules and lists one (referrer-policy-missing is
 * information): a page that sets all but the referrer policy has a note and no problem.
 */
const MIXED_TOOL = 'security-headers'
const MIXED_RULES = [
  'hsts-missing',
  'csp-missing',
  'x-content-type-options-missing',
  'frame-protection-missing',
  'referrer-policy-missing',
]

const reports = {} as Record<
  'problems' | 'passed' | 'partial' | 'failed' | 'noted' | 'nothing' | 'mixed',
  Report
>

/** The report of the security headers tool for a page that lacks only a referrer policy. */
function mixedReport(base: Report): Report {
  const rules = MIXED_RULES.map((id): RuleResult => {
    const rule = ruleById(id)
    if (rule === undefined) throw new Error(id)
    return {
      id,
      version: rule.version,
      category: rule.category,
      severity: rule.severity,
      status: id === 'referrer-policy-missing' ? 'fail' : 'pass',
      title: { ar: rule.copy.ar.title, en: rule.copy.en.title },
    }
  })
  const rule = ruleById('referrer-policy-missing')
  if (rule === undefined) throw new Error('referrer-policy-missing')
  return Report.parse({
    ...base,
    rules,
    summary: summarize(rules),
    findings: [
      {
        ruleId: 'referrer-policy-missing',
        severity: 'info',
        fingerprint: '0123456789abcdef',
        message: { ar: rule.copy.ar.messages.missing, en: rule.copy.en.messages.missing },
        evidence: { url: ADDRESS },
      },
    ],
  })
}

/** A port nothing listens on any more: a scan of it cannot fetch the page. */
async function closedPort(): Promise<number> {
  const gone = await serveSite(pagesRoot)
  await gone.close()
  return gone.port
}

beforeAll(async () => {
  pagesRoot = await mkdtemp(path.join(tmpdir(), 'arablyzer-tool-pages-'))
  await writeFile(path.join(pagesRoot, 'wrong.html'), page('', TEXT))
  await writeFile(path.join(pagesRoot, 'right.html'), page(' dir="rtl"', TEXT))
  await writeFile(path.join(pagesRoot, 'heavy.html'), page(' dir="rtl"', TEXT.repeat(20_000)))
  await writeFile(
    path.join(pagesRoot, 'store.html'),
    page(
      ' dir="rtl"',
      `${TEXT}<img src="/mada.svg" alt="مدى"><img src="/apple-pay.svg" alt="Apple Pay"><img src="/tabby.svg" alt="Tabby">`,
    ),
  )
  pages = await serveSite(pagesRoot)
  const policy = createPolicy({ allowTargets: [{ address: '127.0.0.1', port: pages.port }] })
  reports.problems = await scan(pages.url('/wrong.html'), { ruleIds: RULES, policy })
  reports.passed = await scan(pages.url('/right.html'), { ruleIds: RULES, policy })
  // Past a millisecond, the page is too complex to read: the rules that need it cannot run.
  reports.partial = await scan(pages.url('/heavy.html'), {
    ruleIds: RULES,
    policy,
    parseTimeoutMs: 1,
  })
  // The tool that lists: three methods shown, and none.
  reports.noted = await scan(pages.url('/store.html'), { ruleIds: LISTING_RULES, policy })
  reports.nothing = await scan(pages.url('/right.html'), { ruleIds: LISTING_RULES, policy })
  reports.mixed = mixedReport(reports.passed)
  const port = await closedPort()
  reports.failed = await scan(`http://127.0.0.1:${port}/`, {
    ruleIds: RULES,
    policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port }] }),
  })
  site = await serveSite(DIST, { cleanUrls: true })
}, 60_000)

afterAll(async () => {
  await site.close()
  await pages.close()
  await rm(pagesRoot, { recursive: true, force: true })
})

const statuses = (report: Report) => report.rules.map((rule) => [rule.id, rule.status])

it('stands on real reports of the tool’s two rules', () => {
  expect(statuses(reports.problems)).toEqual([
    ['ar-html-lang', 'pass'],
    ['rtl-html-dir', 'fail'],
  ])
  expect(statuses(reports.passed)).toEqual([
    ['ar-html-lang', 'pass'],
    ['rtl-html-dir', 'pass'],
  ])
  expect([reports.partial.scan.status, ...statuses(reports.partial).map(([, s]) => s)]).toEqual([
    'partial',
    'error',
    'error',
  ])
  expect([reports.failed.scan.status, reports.failed.scan.notices.map((n) => n.code)]).toEqual([
    'failed',
    ['connect-failed'],
  ])
})

interface Shown {
  /** What the page asked the API for. */
  readonly asked: unknown
  /** The small labels in the header of each rule the result lists. */
  readonly labels: readonly string[]
  /** Whether the result links to the fixes. */
  readonly fixLink: boolean
  readonly headline: string
  /** What a screen reader was told. */
  readonly said: string
  /** Each rule the result lists: its status in words, and whether it has the green check. */
  readonly rules: readonly (readonly [string, boolean])[]
  readonly notices: readonly string[]
  /** Where the box and the result are: the box in the aside, the result in the main column. */
  readonly where: {
    readonly boxInAside: boolean
    readonly resultInMain: boolean
    /** The result is the first thing in the main column. */
    readonly resultFirst: boolean
    readonly resultTop: number
    readonly boxTop: number
    readonly boxBottom: number
    readonly checksTop: number
  }
}

/**
 * The tool page in a language, its scan answered as given: a scan that ends with this report
 * (null: none), streamed as it runs or read once it is over.
 */
async function check(
  browser: Browser,
  lang: Lang,
  {
    state,
    report,
    stream = false,
    tool = TOOL,
    viewport,
  }: {
    state: string
    report: Report | null
    stream?: boolean
    tool?: string
    viewport?: { width: number; height: number }
  },
): Promise<Shown> {
  const context = await browser.newContext(viewport === undefined ? {} : { viewport })
  // The site's pages alone; the API's answers are the test's (below), and anything else is
  // refused, Turnstile's script too, were the site built with a key.
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin === site.origin) await route.fallback()
    else await route.abort('blockedbyclient')
  })
  const tab = await context.newPage()
  // What went wrong in the page, for a failure to say (CI saw the island never start in Chromium).
  const troubles: string[] = []
  tab.on('pageerror', (error) => troubles.push(`page error: ${error.message}`))
  tab.on('console', (message) => {
    if (message.type() === 'error') troubles.push(`console: ${message.text()}`)
  })
  tab.on('requestfailed', (request) => {
    troubles.push(`request failed: ${request.url()} (${request.failure()?.errorText ?? ''})`)
  })
  let asked: unknown = null
  const json = (value: unknown, status = 200) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify(value),
  })
  await tab.route('**/api/scans', async (route) => {
    asked = route.request().postDataJSON()
    await route.fulfill(json({ id: ID }, 202))
  })
  await tab.route(`**/api/scans/${ID}`, async (route) => {
    const summary = { id: ID, url: ADDRESS, createdAt: '2026-09-29T00:00:00.000Z', tool }
    await route.fulfill(json({ ...summary, state: stream ? 'running' : state }))
  })
  await tab.route(`**/api/scans/${ID}/events`, async (route) => {
    const events = [
      { type: 'started', engines: [] },
      { type: 'page', status: 200, contentType: 'text/html', error: null },
      { type: 'rules', rules: RULES.length },
      { type: 'done', state },
    ]
    await route.fulfill({
      contentType: 'text/event-stream',
      body: events.map((event, i) => `id: ${i + 1}\ndata: ${JSON.stringify(event)}\n\n`).join(''),
    })
  })
  await tab.route(`**/api/reports/${ID}`, async (route) => {
    await route.fulfill(report === null ? json({ state: 'failed' }, 404) : json(report))
  })
  await tab.goto(site.url(lang === 'ar' ? `/tools/${tool}` : `/en/tools/${tool}`))
  // The button is enabled once the island runs.
  await tab
    .locator('form button[type="submit"]:not([disabled])')
    .waitFor()
    .catch(async (error: unknown) => {
      const island = await tab.evaluate(() => ({
        islands: [...document.querySelectorAll('astro-island')].map((node) =>
          node.hasAttribute('ssr') ? 'waiting' : 'started',
        ),
        idle: 'requestIdleCallback' in window,
        state: document.readyState,
      }))
      throw new Error(
        `The tool's island did not start: ${JSON.stringify(island)}; ${troubles.join(' | ') || 'no error in the page'}`,
        { cause: error },
      )
    })
  await tab.fill('#tool-url', ADDRESS)
  await tab.click('form button[type="submit"]')
  const running = TOOL_APP[lang].result.running
  await tab.waitForFunction((text) => {
    const title = document.querySelector('#result-title')?.textContent
    return title !== undefined && title !== text
  }, running)
  const shown = await tab.evaluate(() => ({
    headline: document.querySelector('#result-title')?.textContent ?? '',
    said: document.querySelector('p[role="status"]')?.textContent ?? '',
    rules: [...document.querySelectorAll('[aria-labelledby="result-checked"] li')].map(
      (item) =>
        [
          item.lastElementChild?.textContent ?? '',
          item.querySelector('svg.text-pass') !== null,
        ] as const,
    ),
    notices: [...document.querySelectorAll('[aria-labelledby="result-notices"] [role="note"]')].map(
      (note) => note.textContent,
    ),
    labels: [...document.querySelectorAll('article > header > span')].map(
      (label) => label.textContent,
    ),
    // The result's own link to the fixes (the aside's list of the page's sections has one too).
    fixLink: document.querySelector('[aria-labelledby="result-title"] a[href="#fix"]') !== null,
    where: (() => {
      const top = (selector: string) =>
        document.querySelector(selector)?.getBoundingClientRect().top ?? -1
      return {
        boxInAside: document.querySelector('.page-aside .scan-box') !== null,
        resultInMain: document.querySelector('.page-main #result-title') !== null,
        resultFirst:
          document.querySelector('.page-main section')?.getAttribute('aria-labelledby') ===
          'result-title',
        resultTop: top('.page-main section[aria-labelledby="result-title"]'),
        boxTop: top('.scan-box'),
        boxBottom: document.querySelector('.scan-box')?.getBoundingClientRect().bottom ?? -1,
        checksTop: top('#checks'),
      }
    })(),
  }))
  await context.close()
  return { asked, ...shown }
}

describe.each(ENGINES)('a tool page in %s', (engine) => {
  let browser: Browser
  beforeAll(async () => {
    const executablePath = executablePathFor(engine)
    browser = await TYPES[engine].launch(executablePath === undefined ? {} : { executablePath })
  })
  afterAll(async () => {
    await browser.close()
  })

  it('asks for its own tool, and says the problem a rule found', async () => {
    const t = TOOL_APP.ar.result
    const shown = await check(browser, 'ar', {
      state: 'complete',
      report: reports.problems,
      stream: true,
    })
    expect(shown.asked).toEqual({ url: ADDRESS, turnstileToken: '', tool: TOOL })
    expect([shown.headline, shown.said]).toEqual([t.problems(1), t.problems(1)])
    expect(shown.rules).toEqual([
      [t.status.pass, true],
      [t.status.fail, false],
    ])
    // The box is in the aside, the result at the head of the main column, above what it checks.
    expect(shown.where.boxInAside).toBe(true)
    expect(shown.where.resultInMain).toBe(true)
    expect(shown.where.resultFirst).toBe(true)
    expect(shown.where.resultTop).toBeLessThan(shown.where.checksTop)
  }, 60_000)

  it('puts the result beside the box on a desktop, and right under it on a phone', async () => {
    const desktop = await check(browser, 'ar', {
      state: 'complete',
      report: reports.problems,
      viewport: { width: 1440, height: 900 },
    })
    // Side by side: the result and the box start on one line of the page.
    expect(Math.abs(desktop.where.resultTop - desktop.where.boxTop)).toBeLessThan(12)
    const phone = await check(browser, 'en', {
      state: 'complete',
      report: reports.problems,
      viewport: { width: 390, height: 844 },
    })
    // One column: the result follows the box within a section's gap, before the first section.
    const gap = phone.where.resultTop - phone.where.boxBottom
    expect(gap).toBeGreaterThan(0)
    expect(gap).toBeLessThan(40)
    expect(phone.where.resultTop).toBeLessThan(phone.where.checksTop)
  }, 60_000)

  it('says the page passes when both rules passed', async () => {
    const t = TOOL_APP.en.result
    const shown = await check(browser, 'en', { state: 'complete', report: reports.passed })
    expect([shown.headline, shown.said]).toEqual([t.passed, t.passed])
    expect(shown.rules).toEqual([
      [t.status.pass, true],
      [t.status.pass, true],
    ])
    expect(shown.notices).toEqual([])
  }, 60_000)

  it('says a partial scan did not finish, with no green check, and why', async () => {
    const t = TOOL_APP.ar.result
    const shown = await check(browser, 'ar', { state: 'partial', report: reports.partial })
    expect([shown.headline, shown.said]).toEqual([t.incomplete, t.incomplete])
    expect(shown.rules).toEqual([
      [t.status.error, false],
      [t.status.error, false],
    ])
    expect(shown.notices).toEqual(reports.partial.scan.notices.map((notice) => notice.message.ar))
  }, 60_000)

  it('reads the report of a scan that failed, and says why', async () => {
    const t = TOOL_APP.en.result
    const shown = await check(browser, 'en', { state: 'failed', report: reports.failed })
    expect([shown.headline, shown.said]).toEqual([t.incomplete, t.incomplete])
    expect(shown.rules.map(([status]) => status)).toEqual([t.status.error, t.status.error])
    expect(shown.notices).toEqual(reports.failed.scan.notices.map((notice) => notice.message.en))
  }, 60_000)

  // M2.3c review: three payment methods shown read "3 problems to fix", and none shown "passes".
  it('counts what a tool that only lists found as notes, with no problem to fix', async () => {
    const t = TOOL_APP.en.result
    const shown = await check(browser, 'en', {
      state: 'complete',
      report: reports.noted,
      tool: LISTING_TOOL,
    })
    expect([shown.headline, shown.said]).toEqual([t.notes(3), t.notes(3)])
    expect(shown.headline).toBe('3 notes, not problems')
    // The one rule is noted, with no green check, and its findings are labelled as not deducted.
    expect(shown.rules).toEqual([[t.information.found, false]])
    expect(shown.labels).toEqual([REPORT.en.findings.notDeducted])
    expect(shown.fixLink).toBe(false)
  }, 60_000)

  it('says nothing was found, and does not say the page passes, for a tool that only lists', async () => {
    const t = TOOL_APP.ar.result
    const shown = await check(browser, 'ar', {
      state: 'complete',
      report: reports.nothing,
      tool: LISTING_TOOL,
    })
    expect([shown.headline, shown.said]).toEqual([t.noneFound, t.noneFound])
    expect(shown.headline).not.toBe(t.passed)
    expect(shown.rules).toEqual([[t.information.none, false]])
    expect(shown.labels).toEqual([])
    expect(shown.fixLink).toBe(false)
  }, 60_000)

  it('counts a note beside rules that judge as a note, and marks the ones that passed', async () => {
    const t = TOOL_APP.en.result
    const shown = await check(browser, 'en', {
      state: 'complete',
      report: reports.mixed,
      tool: MIXED_TOOL,
    })
    expect([shown.headline, shown.said]).toEqual([t.notes(1), t.notes(1)])
    expect(shown.headline).toBe('1 note, not a problem')
    // Four rules passed, each with a green check; the one that lists is noted, with none.
    expect(shown.rules).toEqual([
      [t.status.pass, true],
      [t.status.pass, true],
      [t.status.pass, true],
      [t.status.pass, true],
      [t.information.found, false],
    ])
    expect(shown.labels).toEqual([REPORT.en.findings.notDeducted])
    expect(shown.fixLink).toBe(false)
  }, 60_000)

  it('says a scan without a report could not finish', async () => {
    const t = TOOL_APP.ar.result
    const shown = await check(browser, 'ar', { state: 'failed', report: null })
    expect([shown.headline, shown.said]).toEqual([t.failed, t.failed])
  }, 60_000)
})
