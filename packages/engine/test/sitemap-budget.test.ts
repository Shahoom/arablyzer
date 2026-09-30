import type { RenderOutcome } from '@arablyzer/browser'
import type { RobotsFacts } from '@arablyzer/collectors'
import { collectRobots } from '@arablyzer/collectors'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scan } from '../src/index'
import { fetchSitemaps, networkBudget } from '../src/sitemap'
import { policyFor, renderRule, resolverFor, tempSite, testRule, type TempSite } from './helpers'

// M2.3c review: the ten seconds a scan gave its sitemaps were wall-clock time, which reading a
// large one and parsing it spent as well; and they were taken from the scan before the render,
// which they could then shorten. The budget now counts only the time spent on the network, and the
// sitemaps are fetched after the render.
const { renderPage } = vi.hoisted(() => ({ renderPage: vi.fn() }))
vi.mock('@arablyzer/browser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@arablyzer/browser')>()),
  renderPage,
}))

describe('networkBudget', () => {
  /** A clock the test moves. */
  function clock() {
    const time = { now: 0 }
    return { time, read: () => time.now }
  }

  it('takes off the time work spends, and none of the time between', async () => {
    const { time, read } = clock()
    const budget = networkBudget(1_000, read)
    await budget.during(() => {
      time.now += 300
      return Promise.resolve()
    })
    // Reading and parsing a file happens between: it is not the network's.
    time.now += 5_000
    expect(budget.left()).toBe(700)
    await budget.during(() => {
      time.now += 800
      return Promise.resolve()
    })
    expect(budget.left()).toBe(-100)
  })

  it('takes off the time of work that fails too, and gives the work a signal that ends with it', async () => {
    const { time, read } = clock()
    const budget = networkBudget(50, read)
    // Whether each work's signal had ended when the work did.
    const ended: boolean[] = []
    await expect(
      budget.during((signal) => {
        time.now += 40
        ended.push(signal.aborted)
        return Promise.reject(new Error('down'))
      }),
    ).rejects.toThrow('down')
    expect(budget.left()).toBe(10)
    await budget.during(async (signal) => {
      await new Promise((resolve) => setTimeout(resolve, 100))
      ended.push(signal.aborted)
    })
    expect(ended).toEqual([false, true])
  })

  it('ends with the scan’s own signal as well', async () => {
    const scanSignal = new AbortController()
    const budget = networkBudget(10_000, () => performance.now(), scanSignal.signal)
    scanSignal.abort()
    await budget.during((signal) => {
      expect(signal.aborted).toBe(true)
      return Promise.resolve()
    })
  })
})

describe('fetchSitemaps, with no time left', () => {
  const robots: RobotsFacts = collectRobots({
    url: 'https://shop.example/robots.txt',
    response: {
      status: 200,
      body: new TextEncoder().encode('Sitemap: https://shop.example/a.xml\n'),
      truncated: false,
    },
    errorCode: null,
  })

  it('asks for nothing, and says each sitemap timed out', async () => {
    const asked: string[] = []
    const read = await fetchSitemaps(robots, 'https://shop.example', {
      base: { userAgent: 'test' },
      privateAccess: false,
      budgetMs: 0,
      allowed: (to) => {
        asked.push(to)
        return Promise.resolve(true)
      },
    })
    expect(asked).toEqual([])
    expect('facts' in read && read.facts.checked).toMatchObject([
      { outcome: 'failed', code: 'timeout', named: true },
    ])
  })
})

describe('a scan that renders and reads sitemaps', () => {
  let site: TempSite | undefined
  beforeEach(() => {
    renderPage.mockReset()
  })
  afterEach(async () => {
    await site?.close()
    site = undefined
  })

  it('fetches the sitemaps after the render, which they cannot then shorten', async () => {
    site = await tempSite({
      'site.json': JSON.stringify({ host: 'shop.example' }),
      'index.html': '<!doctype html><html lang="ar" dir="rtl"><p>مرحبا</p></html>',
      'robots.txt': 'Sitemap: http://shop.example/sitemap.xml\n',
      'sitemap.xml':
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>http://shop.example/</loc></url></urlset>',
    })
    const local = site
    // What the site had been asked for when the render began.
    let askedBeforeRender: string[] = []
    renderPage.mockImplementation((_url: string, options: { engines: string[] }) => {
      askedBeforeRender = [...local.requests]
      const outcome: RenderOutcome = {
        engine: 'chromium',
        status: 'failed',
        version: null,
        error: 'not started',
        challenge: null,
        durationMs: 1,
        requests: {
          requests: 0,
          refused: 0,
          unauthenticated: 0,
          limited: false,
          bytes: 0,
          refusals: [],
        },
        pageRequests: { made: 0, overLimit: 0, overHosts: 0, sending: 0 },
        facts: null,
        screenshot: null,
      }
      return Promise.resolve([{ ...outcome, engine: options.engines[0] ?? 'chromium' }])
    })
    const report = await scan(local.url('/'), {
      rules: [
        renderRule(),
        testRule({ id: 'sitemap-rule', needs: ['robots', 'sitemap'], detect: () => [] }),
      ],
      policy: policyFor(local),
      resolver: resolverFor(local),
      render: { engines: ['chromium'] },
    })
    expect(askedBeforeRender).toEqual(['GET /robots.txt', 'GET /'])
    expect(local.requests).toEqual(['GET /robots.txt', 'GET /', 'GET /sitemap.xml'])
    expect(report.rules.find((rule) => rule.id === 'sitemap-rule')?.status).toBe('pass')
  })
})
