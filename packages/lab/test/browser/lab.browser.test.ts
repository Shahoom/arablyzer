import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createPolicy } from '@arablyzer/egress'
import { afterEach, describe, expect, it } from 'vitest'
import { runLab } from '../../src/index'

interface Site {
  readonly url: string
  readonly port: number
  readonly seen: { path: string; agent: string }[]
  close(): Promise<void>
}

const open: Site[] = []
afterEach(async () => {
  for (const site of open.splice(0)) await site.close()
})

async function serve(handler: http.RequestListener): Promise<Site> {
  const seen: Site['seen'] = []
  const server = http.createServer((req, res) => {
    seen.push({ path: req.url ?? '', agent: req.headers['user-agent'] ?? '' })
    handler(req, res)
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = (server.address() as AddressInfo).port
  const site: Site = {
    url: `http://127.0.0.1:${port}/`,
    port,
    seen,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(() => {
          resolve()
        })
      }),
  }
  open.push(site)
  return site
}

const PAGE = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>متجر</title></head>
<body><h1>قهوة عربية بالهيل</h1><p>${'قهوة محمصة بالهيل. '.repeat(40)}</p></body></html>`

const only = (...sites: Site[]) =>
  createPolicy({ allowTargets: sites.map((site) => ({ address: '127.0.0.1', port: site.port })) })

describe('runLab', () => {
  it("measures a page with Lighthouse's performance category, behind the proxy, as Arablyzer", async () => {
    const site = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(PAGE)
    })
    const run = await runLab(site.url, { policy: only(site) })
    expect(run.error).toBeNull()
    expect(run).toMatchObject({ status: 'measured', lighthouse: '13.5.0' })
    expect(run.chromium).toMatch(/Chrome\/\d+/)
    expect(run.performance).toBeGreaterThanOrEqual(0)
    expect(run.metrics?.fcp).toBeGreaterThan(0)
    expect(run.metrics?.lcp).toBeGreaterThan(0)
    expect(run.requests.total).toBeGreaterThan(0)
    // Lighthouse's phone, with Arablyzer's token on every request.
    expect(site.seen.length).toBeGreaterThan(0)
    expect(site.seen.every((request) => request.agent.includes('ArablyzerBot/1.0'))).toBe(true)
  })

  it("stops the page's requests at the limit, as the render does", async () => {
    const site = await serve((req, res) => {
      if (req.url?.startsWith('/i')) {
        res.writeHead(200, { 'content-type': 'image/png' })
        res.end(Buffer.alloc(100))
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        PAGE.replace(
          '</body>',
          `${Array.from({ length: 12 }, (_, i) => `<img src="/i${i}.png" width="10" height="10" alt="">`).join('')}</body>`,
        ),
      )
    })
    const run = await runLab(site.url, { policy: only(site), maxRequests: 5 })
    expect(run.requests.refused).toBeGreaterThan(0)
    expect(site.seen.length).toBeLessThanOrEqual(5)
  })

  it('reaches nothing the policy does not allow', async () => {
    const elsewhere = await serve((_req, res) => {
      res.end('x')
    })
    const site = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(PAGE.replace('</body>', `<img src="${elsewhere.url}secret.png" alt=""></body>`))
    })
    const run = await runLab(site.url, { policy: only(site) })
    expect(elsewhere.seen).toEqual([])
    expect(run.requests.refused).toBeGreaterThan(0)
  })

  it('fails on a page that never loads, within its time limit', async () => {
    const site = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.write('<!doctype html><html><body><p>')
      // Never ends.
    })
    const started = performance.now()
    const run = await runLab(site.url, { policy: only(site), timeoutMs: 20_000 })
    // It never paints, so Lighthouse has no score: failed, or out of time.
    expect(['timeout', 'failed']).toContain(run.status)
    expect(run.performance).toBeNull()
    expect(performance.now() - started).toBeLessThan(35_000)
  })

  it('says when Chromium is not there', async () => {
    const run = await runLab('http://127.0.0.1:9/', { executablePath: '/no/such/chromium' })
    expect(run.status).toBe('unavailable')
  })
})
