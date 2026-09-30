import type { RenderOutcome } from '@arablyzer/browser'
import type { Engine } from '@arablyzer/collectors'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scan } from '../src/index'
import { renderRun } from '../src/scan'
import { flagRule, policyFor, renderRule, schemaErrors, tempSite, type TempSite } from './helpers'

// M2.3c review: the plain fetch can pass a page whose browser is answered a bot challenge. The
// browser package stops there (its browser suite proves that with real engines); these tests hold
// what the engine makes of it, without one.
const { renderPage, runLab } = vi.hoisted(() => ({ renderPage: vi.fn(), runLab: vi.fn() }))
vi.mock('@arablyzer/browser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@arablyzer/browser')>()),
  renderPage,
}))
vi.mock('@arablyzer/lab', () => ({ runLab, LAB_TIMEOUT_MS: 60_000 }))

const PAGE = '<!doctype html><meta name="flag" content="x"><p>نص</p>'
const NO_REQUESTS = { requests: 0, refused: 0, unauthenticated: 0, limited: false, bytes: 0 }

function outcome(
  engine: Engine,
  status: RenderOutcome['status'],
  challenge: RenderOutcome['challenge'] = null,
): RenderOutcome {
  return {
    engine,
    status,
    version: '1.0',
    error: status === 'rendered' ? null : 'English detail for the logs',
    challenge,
    durationMs: 40,
    requests: { ...NO_REQUESTS, refusals: [] },
    pageRequests: { made: 1, overLimit: 0, overHosts: 0, sending: 0 },
    facts: null,
    screenshot: null,
  }
}

let site: TempSite | undefined

beforeEach(() => {
  renderPage.mockReset()
  runLab.mockReset()
})
afterEach(async () => {
  await site?.close()
  site = undefined
})

describe('a scan whose browser met a bot challenge in place of the page', () => {
  async function scanned(lab: boolean) {
    site = await tempSite({ 'index.html': PAGE })
    return scan(site.url('/'), {
      rules: [flagRule(), renderRule()],
      policy: policyFor(site),
      render: { engines: ['chromium', 'firefox'] },
      ...(lab ? { lab: {} } : {}),
    })
  }

  it('records the engine’s run as one that failed, says why, and judges the plain page as before', async () => {
    renderPage.mockImplementation((_url: string, options: { engines: Engine[] }) =>
      Promise.resolve([
        options.engines[0] === 'chromium'
          ? outcome('chromium', 'challenged', { service: 'Cloudflare', status: 403 })
          : outcome('firefox', 'failed'),
      ]),
    )
    const report = await scanned(false)
    expect(schemaErrors(report)).toBe('')
    // Each engine is asked in turn: one that is challenged says nothing of the others.
    expect(renderPage).toHaveBeenCalledTimes(2)
    expect(report.scan.render?.map((run) => [run.engine, run.status])).toEqual([
      ['chromium', 'failed'],
      ['firefox', 'failed'],
    ])
    const challenged = report.scan.notices.find((notice) => notice.code === 'render-challenged')
    expect(challenged?.message.en).toBe(
      'In Chromium, the site answered with a Cloudflare bot challenge (HTTP 403) instead of the page, so the page was not rendered there: Arablyzer never tries to get past a challenge.',
    )
    expect(challenged?.message.ar).toContain('Chromium')
    expect(challenged?.message.ar).toContain('Cloudflare')
    // The plain fetch reached the page, so its rules ran and it has a score; the rule that needs
    // the render could not run, which makes the scan partial.
    expect(report.rules.map((rule) => [rule.id, rule.status])).toEqual([
      ['render-rule', 'error'],
      ['test-rule', 'fail'],
    ])
    expect(report.page).not.toBeNull()
    expect(report.score.overall).not.toBeNull()
    expect(report.scan.status).toBe('partial')
  })

  it('does not open the page in Lighthouse either, where its script could get past the challenge', async () => {
    renderPage.mockResolvedValue([
      outcome('chromium', 'challenged', { service: 'AWS WAF', status: 202 }),
    ])
    const report = await scanned(true)
    expect(runLab).not.toHaveBeenCalled()
    expect(report.facts.lab).toBeUndefined()
    const codes = report.scan.notices.map((notice) => notice.code)
    expect(codes).toContain('render-challenged')
    expect(codes).toContain('lab-challenged')
    expect(codes).not.toContain('lab-skipped')
  })

  it('runs Lighthouse after a render that met none, so the test above is about the challenge', async () => {
    renderPage.mockResolvedValue([outcome('chromium', 'failed')])
    runLab.mockResolvedValue({
      status: 'measured',
      lighthouse: '13.5.0',
      chromium: '1.0',
      error: null,
      durationMs: 1,
      requests: { total: 1, refused: 0 },
      limited: false,
      performance: 90,
      metrics: { fcp: 1, lcp: 2, tbt: 3, si: 4, cls: 0 },
    })
    const report = await scanned(true)
    expect(runLab).toHaveBeenCalledTimes(1)
    expect(report.facts.lab).toMatchObject({ status: 'measured' })
    expect(report.scan.notices.map((notice) => notice.code)).not.toContain('lab-challenged')
  })
})

describe('a render run in the report', () => {
  it('shows a challenged render as one that failed: its reason is the notice’s', () => {
    expect(
      renderRun(outcome('chromium', 'challenged', { service: 'Cloudflare', status: 403 })),
    ).toEqual({
      engine: 'chromium',
      version: '1.0',
      status: 'failed',
      durationMs: 40,
      requests: { total: 1, refused: 0 },
    })
  })
})
