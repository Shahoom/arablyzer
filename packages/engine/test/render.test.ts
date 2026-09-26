import { collectPage, type PageFacts, type RenderedFacts } from '@arablyzer/collectors'
import { afterEach, describe, expect, it } from 'vitest'
import { evaluatePage, scan } from '../src/index'
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
      },
    ],
    arabicTextOmitted: 0,
    fontFaces: [],
    fontRequests: [],
    bidi: [],
    truncated: false,
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
})
