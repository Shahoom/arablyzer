import type * as Browser from '@arablyzer/browser'
import type * as Lab from '@arablyzer/lab'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { scan } from '../src/index'
import { flagRule, policyFor, renderRule, tempSite, type TempSite } from './helpers'

// M3 of the pre-launch review: the scanner ends its process after a scan that started a browser or
// Lighthouse, since only then could a renderer that a page took over touch it, and it knows that one
// did by the steps the scan sends, `render-start` and `lab-start`. So a browser is never launched
// before its step has been sent: the launches here are counted in the order of the steps.
const order = vi.hoisted(() => [] as string[])

vi.mock('@arablyzer/browser', async (importOriginal) => ({
  ...(await importOriginal<typeof Browser>()),
  renderPage: (_url: string, options: { engines: readonly string[] }) => {
    const engine = options.engines[0] ?? ''
    order.push(`launch ${engine}`)
    return Promise.resolve([
      {
        engine,
        status: 'unavailable',
        version: null,
        error: null,
        challenge: null,
        durationMs: 0,
        requests: { refused: 0 },
        pageRequests: { made: 0, overLimit: 0, overHosts: 0, sending: 0 },
        facts: null,
        screenshot: null,
      },
    ])
  },
}))

vi.mock('@arablyzer/lab', async (importOriginal) => ({
  ...(await importOriginal<typeof Lab>()),
  runLab: () => {
    order.push('launch lighthouse')
    return Promise.resolve({
      status: 'unavailable',
      lighthouse: '13.5.0',
      chromium: null,
      error: null,
      durationMs: 0,
      requests: { total: 0, refused: 0 },
      limited: false,
      performance: null,
      metrics: null,
    })
  },
}))

const PAGE = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>متجر</title></head><body><p>نص عربي</p></body></html>`

const sites: TempSite[] = []
afterEach(async () => {
  order.length = 0
  for (const site of sites.splice(0)) await site.close()
})

async function site(...args: Parameters<typeof tempSite>): Promise<TempSite> {
  const created = await tempSite(...args)
  sites.push(created)
  return created
}

/** What a scan says of its browsers and its launches of them, in the order they happened. */
async function browsers(url: string, options: Parameters<typeof scan>[1]): Promise<string[]> {
  await scan(url, {
    ...options,
    onProgress: (step) => {
      if (step.step === 'render-start') order.push(`render-start ${step.engine}`)
      if (step.step === 'lab-start') order.push('lab-start')
    },
  })
  return [...order]
}

describe('a scan that starts a browser', () => {
  it('says so before each one, and before Lighthouse', async () => {
    const local = await site({ 'index.html': PAGE })
    expect(
      await browsers(local.url('/'), {
        rules: [flagRule(), renderRule()],
        policy: policyFor(local),
        render: { engines: ['chromium', 'firefox'] },
        lab: {},
      }),
    ).toEqual([
      'render-start chromium',
      'launch chromium',
      'render-start firefox',
      'launch firefox',
      'lab-start',
      'launch lighthouse',
    ])
  })

  it('says nothing, and starts nothing, where the page is not one a browser is given', async () => {
    const json = await site(
      { 'index.html': '{"a":1}' },
      { '/': { headers: { 'content-type': 'application/json' } } },
    )
    expect(
      await browsers(json.url('/'), {
        rules: [flagRule()],
        policy: policyFor(json),
        render: { engines: ['chromium'] },
        lab: {},
      }),
    ).toEqual([])
    // Nor a page that was never reached.
    expect(
      await browsers('http://10.0.0.1/', {
        rules: [flagRule()],
        render: { engines: ['chromium'] },
        lab: {},
      }),
    ).toEqual([])
  })

  it('says nothing, and starts nothing, in a scan that asked for no browser', async () => {
    const local = await site({ 'index.html': PAGE })
    expect(
      await browsers(local.url('/'), { rules: [flagRule()], policy: policyFor(local) }),
    ).toEqual([])
  })
})
