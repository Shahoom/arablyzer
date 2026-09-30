import { DEFAULT_MAX_HOSTS, type PageRequests, type RenderOutcome } from '@arablyzer/browser'
import type { Engine } from '@arablyzer/collectors'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scan } from '../src/index'
import { flagRule, policyFor, renderRule, schemaErrors, tempSite, type TempSite } from './helpers'

// M1 review (issue #29): the render's browsers refuse every request that sends data, and every
// request to a host past the host limit. The browser package's suite proves that with real engines;
// these tests hold what the report makes of the counts they give, without one: the run's request
// counts, and a notice for each engine, counted as the request limit is.
const { renderPage } = vi.hoisted(() => ({ renderPage: vi.fn() }))
vi.mock('@arablyzer/browser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@arablyzer/browser')>()),
  renderPage,
}))

const PAGE = '<!doctype html><meta name="flag" content="x"><p>نص</p>'

function outcome(engine: Engine, pageRequests: Partial<PageRequests>): RenderOutcome {
  return {
    engine,
    status: 'rendered',
    version: '1.0',
    error: null,
    challenge: null,
    durationMs: 40,
    requests: {
      requests: 3,
      refused: 1,
      unauthenticated: 0,
      limited: false,
      bytes: 100,
      refusals: [],
    },
    pageRequests: { made: 20, overLimit: 0, overHosts: 0, sending: 0, ...pageRequests },
    facts: null,
    screenshot: null,
  }
}

let site: TempSite | undefined

beforeEach(() => {
  renderPage.mockReset()
})
afterEach(async () => {
  await site?.close()
  site = undefined
})

async function scanned(byEngine: Partial<Record<Engine, Partial<PageRequests>>>) {
  renderPage.mockImplementation((_url: string, options: { engines: Engine[] }) => {
    const engine = options.engines[0] ?? 'chromium'
    return Promise.resolve([outcome(engine, byEngine[engine] ?? {})])
  })
  site = await tempSite({ 'index.html': PAGE })
  return scan(site.url('/'), {
    rules: [flagRule(), renderRule()],
    policy: policyFor(site),
    render: { engines: ['chromium', 'firefox'] },
  })
}

describe('a scan whose page asked its browsers to send data', () => {
  it('says so for each engine that refused it, and counts those requests in that run’s refusals', async () => {
    const report = await scanned({ chromium: { sending: 12 } })
    expect(schemaErrors(report)).toBe('')
    // The proxy refused one (its own count, 1), and the browser refused twelve more.
    expect(report.scan.render?.map((run) => [run.engine, run.requests])).toEqual([
      ['chromium', { total: 20, refused: 13 }],
      ['firefox', { total: 20, refused: 1 }],
    ])
    const notices = report.scan.notices.filter((notice) => notice.code === 'request-refused')
    expect(notices).toHaveLength(1)
    expect(notices[0]?.message.en).toBe(
      'In Chromium, the page asked to send data (a form, a POST request, a beacon or a WebSocket). Arablyzer’s browsers send nothing a page asks them to, so those requests were refused, and the page may look different from what visitors see.',
    )
    expect(notices[0]?.message.ar).toContain('Chromium')
    expect(notices[0]?.message.ar).toContain('POST')
    expect(notices[0]?.message.ar).toContain('WebSocket')
  })

  it('is not the request limit, whose notice it does not repeat', async () => {
    const report = await scanned({ chromium: { sending: 12 }, firefox: { sending: 2 } })
    const codes = report.scan.notices.map((notice) => notice.code)
    expect(codes.filter((code) => code === 'request-refused')).toHaveLength(2)
    expect(codes).not.toContain('request-limit')
    expect(codes).not.toContain('host-limit')
  })
})

describe('a scan whose page reached more hosts than the limit', () => {
  it('says so, with the limit, and counts those requests in the run’s refusals', async () => {
    const report = await scanned({ firefox: { overHosts: 9 } })
    expect(schemaErrors(report)).toBe('')
    expect(report.scan.render?.map((run) => [run.engine, run.requests])).toEqual([
      ['chromium', { total: 20, refused: 1 }],
      ['firefox', { total: 20, refused: 10 }],
    ])
    const notices = report.scan.notices.filter((notice) => notice.code === 'host-limit')
    expect(notices.map((notice) => notice.message.en)).toEqual([
      `In Firefox, the page contacted more hosts than the limit of ${String(DEFAULT_MAX_HOSTS)}, so its requests to the others were refused, and it may look different from what visitors see.`,
    ])
    // The limit is the code's own, in the Arabic too.
    expect(notices[0]?.message.ar).toContain(String(DEFAULT_MAX_HOSTS))
    expect(notices[0]?.message.ar).toContain('Firefox')
    expect(report.scan.notices.map((notice) => notice.code)).not.toContain('request-refused')
  })
})

describe('a scan whose page asked for nothing that was refused', () => {
  it('has neither notice', async () => {
    const report = await scanned({})
    const codes = report.scan.notices.map((notice) => notice.code)
    expect(codes).not.toContain('request-refused')
    expect(codes).not.toContain('host-limit')
  })
})
