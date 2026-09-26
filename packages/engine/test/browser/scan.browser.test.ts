import type { Engine } from '@arablyzer/collectors'
import { ENGINES } from '@arablyzer/collectors'
import { engineAvailable } from '@arablyzer/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { scan } from '../../src/index'
import { policyFor, renderRule, schemaErrors, tempSite, type TempSite } from '../helpers'

/** The first engine that launches here; CI installs all three. */
async function firstEngine(): Promise<Engine> {
  for (const engine of ENGINES) if (await engineAvailable(engine)) return engine
  throw new Error(
    'No browser launches here: install Playwright browsers or set ARABLYZER_CHROMIUM_PATH',
  )
}
const engine = await firstEngine()

let site: TempSite | undefined

afterEach(async () => {
  await site?.close()
  site = undefined
})

describe(`scan with rendering (${engine})`, () => {
  it('renders the page, runs the rules that need it, and records the run', async () => {
    site = await tempSite({
      'index.html':
        '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><p id="a">مرحبا بكم</p></html>',
    })
    const screenshots: [Engine, number][] = []
    const report = await scan(site.url('/'), {
      rules: [renderRule()],
      policy: policyFor(site),
      render: {
        engines: [engine],
        screenshots: true,
        onScreenshot: (from, png) => screenshots.push([from, png.length]),
      },
    })
    expect(schemaErrors(report)).toBe('')
    expect(report.scan.status).toBe('complete')
    expect(report.scan.render?.map((run) => [run.engine, run.status, typeof run.version])).toEqual([
      [engine, 'rendered', 'string'],
    ])
    expect(
      report.findings.map((finding) => [finding.evidence.selector, finding.evidence.engines]),
    ).toEqual([['#a', [engine]]])
    expect(screenshots.map(([from]) => from)).toEqual([engine])
    expect(screenshots[0]?.[1]).toBeGreaterThan(0)
  })

  it('says when the engine is missing, and the rules that needed it could not run', async () => {
    site = await tempSite({ 'index.html': '<p>نص</p>' })
    const report = await scan(site.url('/'), {
      rules: [renderRule()],
      policy: policyFor(site),
      render: { engines: [engine], executablePaths: { [engine]: '/nonexistent/browser' } },
    })
    expect(schemaErrors(report)).toBe('')
    expect(report.scan.status).toBe('partial')
    expect(report.scan.render).toEqual([
      expect.objectContaining({ engine, status: 'unavailable', version: null }),
    ])
    expect(report.scan.notices.map((notice) => notice.code)).toContain('engine-unavailable')
    expect(report.rules).toEqual([
      expect.objectContaining({ id: 'render-rule', status: 'error', error: 'not-rendered' }),
    ])
  })

  it('renders nothing when the page is not an HTML page', async () => {
    site = await tempSite({ 'data.json': '{"a": 1}' })
    const report = await scan(site.url('/data.json'), {
      rules: [renderRule()],
      policy: policyFor(site),
      render: { engines: [engine] },
    })
    expect(report.scan.render).toEqual([])
    expect(report.rules).toEqual([expect.objectContaining({ status: 'not-applicable' })])
  })
})
