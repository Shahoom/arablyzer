import { collectPage, type PageFacts, type RenderedFacts } from '@arablyzer/collectors'
import { afterEach, describe, expect, it } from 'vitest'
import { evaluatePage, scan } from '../src/index'
import { renderRun } from '../src/scan'
import { flagRule, policyFor, renderRule, tempSite, type TempSite } from './helpers'

const page = (html: string): PageFacts =>
  collectPage({
    url: 'https://example.com/',
    status: 200,
    headers: [['content-type', 'text/html; charset=utf-8']],
    body: new TextEncoder().encode(html),
  })

const ARABIC = page('<html lang="ar" dir="rtl"><body><p id="a">نص عربي</p></body></html>')

function facts(engine: RenderedFacts['engine']): RenderedFacts {
  return {
    engine,
    version: '1.0',
    url: 'https://example.com/',
    status: 200,
    viewport: { width: 390, height: 844 },
    dir: 'rtl',
    lang: 'ar',
    viewportMeta: null,
    scrollWidth: 390,
    overflow: [],
    arabicText: [
      {
        selector: '#a',
        box: { x: 10, y: 20, width: 100, height: 30 },
        text: 'نص عربي',
        letterSpacing: 0,
        letterSpacingApplied: null,
        fontFamily: 'serif',
        primaryFamily: 'serif',
        arabicCharacters: 'برصعني',
      },
    ],
    arabicTextOmitted: 0,
    fontFaces: [],
    fontFacesOmitted: 0,
    fontRequests: [],
    arabicFontCoverage: [],
    webFonts: [],
    stylesheets: { read: 0, unread: 0, physical: [] },
    bidi: [],
    fields: [],
    directionIcons: [],
    riyalSigns: [],
    roleIcons: [],
    compression: { checked: 0, uncompressed: [] },
    images: [],
    a11y: null,
    truncated: false,
    limited: false,
    filesRead: true,
  }
}

let site: TempSite | undefined

afterEach(async () => {
  await site?.close()
  site = undefined
})

describe('rules that need rendering', () => {
  it('are left out of a scan that does not render, and a notice says so', async () => {
    site = await tempSite({ 'index.html': '<meta name="flag" content="x"><p>نص</p>' })
    const report = await scan(site.url('/'), {
      rules: [flagRule(), renderRule()],
      policy: policyFor(site),
    })
    expect(report.rules.map((rule) => rule.id)).toEqual(['test-rule'])
    expect(report.scan.notices.map((notice) => notice.code)).toContain('render-skipped')
    expect(report.scan.render).toBeUndefined()
  })

  it('cannot be asked for by id without rendering', async () => {
    await expect(
      scan('https://example.com/', { rules: [renderRule()], ruleIds: ['render-rule'] }),
    ).rejects.toThrow(/need the page rendered/)
  })

  it('read the rendered facts, and their findings keep the engines and the box', () => {
    const { results, findings } = evaluatePage(ARABIC, {
      rules: [renderRule()],
      rendered: [facts('chromium'), facts('firefox')],
    })
    expect(results.map((result) => [result.id, result.status])).toEqual([['render-rule', 'fail']])
    expect(findings.map((finding) => finding.evidence)).toEqual([
      expect.objectContaining({
        selector: '#a',
        engines: ['chromium'],
        box: { x: 10, y: 20, width: 100, height: 30 },
      }),
      expect.objectContaining({ selector: '#a', engines: ['firefox'] }),
    ])
  })

  it('see only the engines they can read, and are errors when none of those rendered', () => {
    const chromiumOnly = renderRule({ renderEngines: ['chromium'] })
    const onlyChromium = evaluatePage(ARABIC, {
      rules: [chromiumOnly],
      rendered: [facts('firefox'), facts('chromium')],
    })
    expect(onlyChromium.findings.map((finding) => finding.evidence.engines)).toEqual([['chromium']])
    const { results } = evaluatePage(ARABIC, { rules: [chromiumOnly], rendered: [facts('webkit')] })
    expect(results).toEqual([
      expect.objectContaining({ id: 'render-rule', status: 'error', error: 'not-rendered' }),
    ])
  })

  it('that read the page files see only engines that read them, and are errors when none did (M1.3a review)', () => {
    const filesRule = renderRule({ needs: ['render', 'files'] })
    const unread = { ...facts('firefox'), filesRead: false }
    const some = evaluatePage(ARABIC, { rules: [filesRule], rendered: [unread, facts('chromium')] })
    expect(some.findings.map((finding) => finding.evidence.engines)).toEqual([['chromium']])
    const none = evaluatePage(ARABIC, { rules: [filesRule], rendered: [unread] })
    expect(none.results).toEqual([
      expect.objectContaining({ id: 'render-rule', status: 'error', error: 'files-unread' }),
    ])
    // A rule that does not read them is not held back.
    expect(evaluatePage(ARABIC, { rules: [renderRule()], rendered: [unread] }).results).toEqual([
      expect.objectContaining({ id: 'render-rule', status: 'fail' }),
    ])
  })

  it('decide whether they apply from the rendered page, which the HTML may not show', () => {
    const rule = renderRule({
      appliesTo: (_page, evidence) =>
        evidence?.rendered?.some((rendered) => rendered.arabicText.length > 0) ?? false,
    })
    const blank = { ...facts('chromium'), arabicText: [] }
    // The HTML has no Arabic text; the page's scripts added it.
    const empty = page(
      '<html><body><div id="app"></div><script src="/app.js"></script></body></html>',
    )
    expect(evaluatePage(empty, { rules: [rule], rendered: [facts('chromium')] }).results).toEqual([
      expect.objectContaining({ id: 'render-rule', status: 'fail' }),
    ])
    expect(evaluatePage(empty, { rules: [rule], rendered: [blank] }).results).toEqual([
      expect.objectContaining({ id: 'render-rule', status: 'not-applicable' }),
    ])
  })

  it('are left out of evaluatePage without rendered facts', () => {
    const { results } = evaluatePage(ARABIC, { rules: [flagRule(), renderRule()] })
    expect(results.map((result) => result.id)).toEqual(['test-rule'])
  })
})

describe('a scan asked to render', () => {
  it('is partial when an engine is missing, even if no rule needed it', async () => {
    site = await tempSite({ 'index.html': '<meta name="flag" content="x"><p>نص</p>' })
    const report = await scan(site.url('/'), {
      rules: [flagRule()],
      policy: policyFor(site),
      render: { engines: ['chromium'], executablePaths: { chromium: '/nonexistent/browser' } },
    })
    expect(report.rules.map((rule) => [rule.id, rule.status])).toEqual([['test-rule', 'fail']])
    expect(report.scan.render).toEqual([
      expect.objectContaining({ engine: 'chromium', status: 'unavailable', version: null }),
    ])
    expect(report.scan.notices.map((notice) => notice.code)).toContain('engine-unavailable')
    expect(report.scan.status).toBe('partial')
  })

  it('refuses WebKit where the network is not isolated, and says why', async () => {
    site = await tempSite({ 'index.html': '<p>نص</p>' })
    const report = await scan(site.url('/'), {
      rules: [flagRule()],
      policy: policyFor(site),
      render: { engines: ['webkit'], networkIsolated: false },
    })
    expect(report.scan.render).toEqual([
      {
        engine: 'webkit',
        version: null,
        status: 'refused',
        durationMs: 0,
        requests: { total: 0, refused: 0 },
      },
    ])
    const refused = report.scan.notices.find((notice) => notice.code === 'engine-refused')
    expect(refused?.message.en).toMatch(/^WebKit sends some of its traffic around the proxy/)
    expect(report.scan.status).toBe('partial')
  })

  it('leaves out rules that read only engines it does not render in, and says so', async () => {
    site = await tempSite({ 'index.html': '<p>نص</p>' })
    const chromiumOnly = renderRule({ renderEngines: ['chromium'] })
    const report = await scan(site.url('/'), {
      rules: [flagRule(), chromiumOnly],
      policy: policyFor(site),
      render: { engines: ['firefox'], executablePaths: { firefox: '/nonexistent/firefox' } },
    })
    expect(report.rules.map((rule) => rule.id)).toEqual(['test-rule'])
    const skipped = report.scan.notices.find((notice) => notice.code === 'render-engine-skipped')
    expect(skipped?.message.en).toBe(
      'Some checks read what only Chromium reports, and this scan did not render in it, so they did not run.',
    )
  })

  it('refuses such a rule named by id', async () => {
    await expect(
      scan('https://example.com/', {
        rules: [renderRule({ renderEngines: ['chromium'] })],
        ruleIds: ['render-rule'],
        render: { engines: ['firefox'] },
      }),
    ).rejects.toThrow(/render-rule \(chromium\)/)
  })
})

// The owner's sites (2026-09-27): a page that loaded dozens of files over two HTTPS connections
// reported "2 requests", the proxy's count of tunnels. The browser counts every request.
describe('a render run in the report', () => {
  it('counts the requests the page made, and those not let through', () => {
    expect(
      renderRun({
        engine: 'chromium',
        version: '153.0',
        status: 'rendered',
        error: null,
        challenge: null,
        durationMs: 5,
        requests: {
          requests: 2,
          refused: 1,
          unauthenticated: 0,
          limited: true,
          bytes: 10,
          refusals: [],
        },
        pageRequests: { made: 61, overLimit: 51, overHosts: 0, sending: 0 },
        facts: null,
        screenshot: null,
      }),
    ).toEqual({
      engine: 'chromium',
      version: '153.0',
      status: 'rendered',
      durationMs: 5,
      requests: { total: 61, refused: 52 },
    })
  })

  // M1 review (issue #29): what the browser refused for sending data, or for a host past the limit,
  // is counted with what the request limit refused, and not in the proxy's count, which never saw it.
  it('counts what was refused for sending data or for a host past the limit with the rest', () => {
    const run = renderRun({
      engine: 'firefox',
      version: '155.0',
      status: 'rendered',
      error: null,
      challenge: null,
      durationMs: 7,
      requests: {
        requests: 20,
        refused: 2,
        unauthenticated: 0,
        limited: false,
        bytes: 10,
        refusals: [],
      },
      pageRequests: { made: 40, overLimit: 0, overHosts: 6, sending: 12 },
      facts: null,
      screenshot: null,
    })
    expect(run.requests).toEqual({ total: 40, refused: 2 + 6 + 12 })
  })
})
