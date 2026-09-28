import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
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
  it('measures an http: page by its host name, behind the proxy, as Arablyzer, and asks no one else', async () => {
    const site = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(PAGE)
    })
    // Every name the browser's traffic needs, as the proxy resolves it: the page's alone. The full
    // browser also asked for www.google.com, and tried http: pages over https: first (M1.3b review).
    const asked: string[] = []
    const run = await runLab(`http://shop.example:${site.port}/`, {
      policy: only(site),
      resolver: (hostname) => {
        asked.push(hostname)
        return Promise.resolve(
          hostname === 'shop.example' ? [{ address: '127.0.0.1', family: 4 as const }] : [],
        )
      },
    })
    expect([...new Set(asked)]).toEqual(['shop.example'])
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

  it('opens no pop-up, whose requests would escape the count, the worker guard and the user agent', async () => {
    const site = await serve((req, res) => {
      if (req.url === '/popup.html') {
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end('<script>for (let i = 0; i < 30; i++) fetch("/f" + i)</script>')
        return
      }
      if (req.url?.startsWith('/f')) {
        res.end('x')
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(PAGE.replace('</body>', '<script>window.open("/popup.html")</script></body>'))
    })
    const run = await runLab(site.url, { policy: only(site), maxRequests: 5 })
    expect(site.seen.length).toBeLessThanOrEqual(5)
    expect(site.seen.map((request) => request.path)).not.toContain('/popup.html')
    expect(run.status).toBe('measured')
  })

  it('stops, and kills, a browser that starts and never answers, within its time limit', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'arablyzer-lab-'))
    const pidFile = path.join(dir, 'pid')
    const stuck = path.join(dir, 'chromium')
    writeFileSync(stuck, `#!/bin/sh\necho $$ > "${pidFile}"\nexec sleep 1000\n`)
    chmodSync(stuck, 0o755)
    try {
      const started = performance.now()
      const run = await runLab('http://127.0.0.1:9/', { executablePath: stuck, timeoutMs: 8_000 })
      expect(['timeout', 'failed']).toContain(run.status)
      expect(performance.now() - started).toBeLessThan(20_000)
      // puppeteer ends what it started on the abort, within its own 5 s grace (closeBrowser).
      const pid = Number(readFileSync(pidFile, 'utf8'))
      const alive = () => {
        try {
          process.kill(pid, 0)
          return true
        } catch {
          return false
        }
      }
      for (let waited = 0; alive() && waited < 10_000; waited += 250) {
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
      expect(alive()).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('gives no metrics for a page still loading when Lighthouse stopped waiting', async () => {
    const site = await serve((req, res) => {
      if (req.url === '/hero.png') {
        // Past the 10 s that a 25 s budget leaves the page to load.
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'image/png' })
          res.end(Buffer.alloc(100))
        }, 14_000).unref()
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        PAGE.replace('</body>', '<img src="/hero.png" width="300" height="200" alt=""></body>'),
      )
    })
    const run = await runLab(site.url, { policy: only(site), timeoutMs: 25_000 })
    expect(run.status).toBe('timeout')
    expect(run.metrics).toBeNull()
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
