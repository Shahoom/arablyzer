import { afterEach, describe, expect, it } from 'vitest'
import { scan, type ScanProgress } from '../src/index'
import { flagRule, policyFor, renderRule, tempSite, type TempSite } from './helpers'

const sites: TempSite[] = []
afterEach(async () => {
  for (const site of sites.splice(0)) await site.close()
})

async function site(...args: Parameters<typeof tempSite>): Promise<TempSite> {
  const created = await tempSite(...args)
  sites.push(created)
  return created
}

const PAGE = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="flag" content="x"><title>متجر</title></head><body><p>نص عربي</p></body></html>`

describe('scan: onProgress', () => {
  it('reports each step as it happens, in order', async () => {
    const local = await site({ 'index.html': PAGE, 'robots.txt': 'User-agent: *\nAllow: /\n' })
    const steps: ScanProgress[] = []
    await scan(local.url('/'), {
      rules: [flagRule(), flagRule({ id: 'robots-rule', needs: ['robots'] }), renderRule()],
      policy: policyFor(local),
      render: {
        engines: ['chromium', 'firefox'],
        executablePaths: { chromium: '/nonexistent/chromium', firefox: '/nonexistent/firefox' },
      },
      onProgress: (step) => steps.push(step),
    })
    // Each engine's run, by what the page shows of it.
    const shown = steps.map((step) =>
      step.step === 'render'
        ? { step: 'render', engine: step.run.engine, status: step.run.status }
        : step,
    )
    expect(shown).toEqual([
      { step: 'page', status: 200, contentType: 'text/html; charset=utf-8', error: null },
      { step: 'robots', outcome: 'fetched', status: 200 },
      { step: 'render-start', engine: 'chromium' },
      { step: 'render', engine: 'chromium', status: 'unavailable' },
      { step: 'render-start', engine: 'firefox' },
      { step: 'render', engine: 'firefox', status: 'unavailable' },
      { step: 'rules', rules: 3 },
    ])
  })

  it('reports the page it could not fetch, and nothing after', async () => {
    const steps: ScanProgress[] = []
    await scan('http://10.0.0.1/', { rules: [flagRule()], onProgress: (step) => steps.push(step) })
    expect(steps).toEqual([
      { step: 'page', status: null, contentType: null, error: 'blocked-address' },
    ])
  })

  it('says CrUX was skipped when the scan has no key for it', async () => {
    const local = await site({ 'index.html': PAGE })
    const steps: ScanProgress[] = []
    await scan(local.url('/'), {
      rules: [flagRule({ id: 'crux-rule', needs: ['crux'] })],
      policy: policyFor(local),
      onProgress: (step) => steps.push(step),
    })
    expect(steps.map((step) => step.step)).toEqual(['page', 'crux', 'rules'])
    expect(steps[1]).toEqual({ step: 'crux', outcome: 'skipped' })
  })

  it('never lets a listener change or break the scan', async () => {
    const local = await site({ 'index.html': PAGE })
    const options = { rules: [flagRule()], policy: policyFor(local) }
    const quiet = await scan(local.url('/'), options)
    const throwing = await scan(local.url('/'), {
      ...options,
      onProgress: () => {
        throw new Error('a broken listener')
      },
    })
    const rejecting = await scan(local.url('/'), {
      ...options,
      onProgress: () => Promise.reject(new Error('a broken async listener')),
    })
    const same = (report: typeof quiet) => ({
      ...report,
      target: { ...report.target, fetchedAt: '' },
      scan: { ...report.scan, durationMs: 0 },
    })
    expect(same(throwing)).toEqual(same(quiet))
    expect(same(rejecting)).toEqual(same(quiet))
  })
})
