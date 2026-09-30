import type { Engine } from '@arablyzer/collectors'
import { ENGINES } from '@arablyzer/collectors'
import { engineAvailable } from '@arablyzer/browser'
import { createPolicy } from '@arablyzer/egress'
import { serveHandler } from '@arablyzer/fixtures'
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

describe('scan with Lighthouse (M1.3b)', () => {
  it("adds Lighthouse's lab metrics as a fact, never as a finding or in the score", async () => {
    site = await tempSite({
      'index.html':
        '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>متجر</title></head><body><h1>قهوة عربية</h1><p>نص عربي</p></body></html>',
    })
    const without = await scan(site.url('/'), { rules: [renderRule()], policy: policyFor(site) })
    const report = await scan(site.url('/'), {
      rules: [renderRule()],
      policy: policyFor(site),
      lab: {},
    })
    expect(schemaErrors(report)).toBe('')
    expect(report.scan.status).toBe('complete')
    expect(report.facts.lab).toMatchObject({ status: 'measured', lighthouse: '13.5.0' })
    expect(report.facts.lab?.metrics?.fcp).toBeGreaterThan(0)
    expect(report.score).toEqual(without.score)
    expect(report.findings).toEqual(without.findings)
  })
})

// M2.3c review: a site can answer the scan's own request with the page and its browser with a bot
// challenge, whose script, once run, may get past it (BUILD-PLAN §13). The browser is refused the
// document before any script of it runs, and Lighthouse, whose navigation cannot be stopped so,
// is not started.
describe(`scan: a browser answered with a bot challenge (${engine})`, () => {
  const CHALLENGE =
    '<!doctype html><title>Just a moment...</title><script>fetch("/ran-inline")</script><script src="/challenge.js"></script>'
  const PAGE =
    '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><p id="a">مرحبا بكم</p></html>'

  it('stops that render, judges the page the plain fetch reached, and opens nothing in Lighthouse', async () => {
    const asked: string[] = []
    // The scan's own fetches say who they are and no more; a browser's user agent says Mozilla.
    const answering = await serveHandler((req, res) => {
      if (req.url !== '/favicon.ico') asked.push(req.url ?? '')
      const browser = (req.headers['user-agent'] ?? '').includes('Mozilla')
      if (req.url === '/' && browser) {
        res.writeHead(403, {
          'content-type': 'text/html; charset=UTF-8',
          'cf-mitigated': 'challenge',
        })
        res.end(CHALLENGE)
      } else if (req.url === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(PAGE)
      } else {
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('Not Found')
      }
    })
    try {
      const report = await scan(answering.url('/'), {
        rules: [renderRule()],
        policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: answering.port }] }),
        render: { engines: [engine] },
        lab: {},
      })
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(schemaErrors(report)).toBe('')
      expect(report.scan.render?.map((run) => [run.engine, run.status])).toEqual([
        [engine, 'failed'],
      ])
      const codes = report.scan.notices.map((notice) => notice.code)
      expect(codes).toContain('render-challenged')
      expect(codes).toContain('lab-challenged')
      expect(report.facts.lab).toBeUndefined()
      expect(report.rules).toEqual([
        expect.objectContaining({ id: 'render-rule', status: 'error', error: 'not-rendered' }),
      ])
      expect(report.scan.status).toBe('partial')
      // robots.txt, the scan's fetch, the browser's document, and no Lighthouse after them.
      expect(asked.filter((path) => path !== '/robots.txt').slice(0, 2)).toEqual(['/', '/'])
      expect(asked).not.toContain('/ran-file')
    } finally {
      await answering.close()
    }
  })
})

// M1 review (issue #29): a page's scripts run in the render's browsers, which send nothing the page
// asks them to send. What the browser refused is counted in the report's run, and told in a notice
// (the browser package's suite proves what is refused, in every engine, to a second server).
describe(`scan: a page that asks its browser to send data (${engine})`, () => {
  it('sends none of it to the site, and the report says what was refused', async () => {
    const sent: string[] = []
    const answering = await serveHandler((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><p id="a">مرحبا بكم</p>
<script>
fetch('/log', { method: 'POST', body: 'x' }).catch(() => {});
navigator.sendBeacon('/beacon', 'x');
try { new WebSocket('ws://' + location.host + '/socket') } catch (error) {}
</script></html>`)
        return
      }
      if (req.url !== '/favicon.ico' && req.url !== '/robots.txt') {
        sent.push(`${req.method ?? ''} ${req.url ?? ''}`)
      }
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('Not Found')
    })
    try {
      const report = await scan(answering.url('/'), {
        rules: [renderRule()],
        policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: answering.port }] }),
        render: { engines: [engine] },
      })
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(schemaErrors(report)).toBe('')
      expect(sent).toEqual([])
      const [run] = report.scan.render ?? []
      expect(run).toMatchObject({ engine, status: 'rendered' })
      // The page, the favicon perhaps, and three that were refused: the run counts them all.
      expect(run?.requests.refused).toBeGreaterThanOrEqual(3)
      const notice = report.scan.notices.find((item) => item.code === 'request-refused')
      expect(notice?.message.en).toMatch(
        /^In (Chromium|Firefox|WebKit), the page asked to send data/,
      )
      expect(report.scan.notices.map((item) => item.code)).not.toContain('request-limit')
    } finally {
      await answering.close()
    }
  })
})
