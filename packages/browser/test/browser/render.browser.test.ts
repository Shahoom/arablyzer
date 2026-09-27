import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Engine } from '@arablyzer/collectors'
import { createPolicy } from '@arablyzer/egress'
import { afterEach, describe, expect, it } from 'vitest'
import {
  bypassesProxyForLoopback,
  renderPage,
  type RenderOptions,
  type RenderOutcome,
} from '../../src/index'
import { enginesUnderTest, pages, serve } from './helpers'

// WebKit never renders on macOS (LOOPBACK_BYPASS); CI measures it on Linux.
const engines = (await enginesUnderTest()).filter((engine) => !bypassesProxyForLoopback(engine))
const cleanup: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

const font = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../fixtures/shared/fonts/${name}`, import.meta.url)))
const ARABIC_FONT = font('arablyzer-test-arabic.ttf')
const LATIN_FONT = font('arablyzer-test-latin.ttf')

function arabicPage(body: string, head = ''): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">${head}</head>
<body style="margin: 0; font-family: serif">${body}</body></html>`
}

async function rendered(
  engine: Engine,
  routes: Parameters<typeof pages>[0],
  options: Partial<RenderOptions> = {},
): Promise<RenderOutcome> {
  const site = await serve(pages(routes))
  cleanup.push(() => site.close())
  const [outcome] = await renderPage(site.url('/'), {
    engines: [engine],
    policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
    // These pages use no WebRTC, the one route that needs isolation (see the SSRF suite).
    networkIsolated: true,
    ...options,
  })
  if (outcome === undefined) throw new Error('No outcome')
  return outcome
}

async function facts(engine: Engine, routes: Parameters<typeof pages>[0]) {
  const outcome = await rendered(engine, routes)
  expect(outcome.status, outcome.error ?? '').toBe('rendered')
  if (outcome.facts === null) throw new Error('No facts')
  return outcome.facts
}

describe.each(engines)('rendered facts: %s', (engine) => {
  it('measures an Arabic page: direction, language, viewport and text blocks', async () => {
    const page = await facts(engine, {
      '/': arabicPage('<p id="intro">مرحبا بكم في متجرنا</p><p lang="en">Hello</p>'),
    })
    expect(page).toMatchObject({
      engine,
      status: 200,
      dir: 'rtl',
      lang: 'ar',
      viewport: { width: 390, height: 844 },
      viewportMeta: 'width=device-width, initial-scale=1',
      scrollWidth: 390,
      overflow: [],
      bidi: [],
      truncated: false,
    })
    expect(page.version).not.toBe('')
    expect(page.arabicText).toEqual([
      expect.objectContaining({
        selector: '#intro',
        text: 'مرحبا بكم في متجرنا',
        letterSpacing: 0,
        letterSpacingApplied: null,
        primaryFamily: 'serif',
      }),
    ])
  })

  it('records letter-spacing on Arabic text, and whether this engine applied it', async () => {
    const page = await facts(engine, {
      '/': arabicPage('<p id="spaced" style="letter-spacing: 4px">مرحبا بكم في متجرنا</p>'),
    })
    const [block] = page.arabicText
    expect(block).toMatchObject({ selector: '#spaced', letterSpacing: 4 })
    expect(typeof block?.letterSpacingApplied).toBe('boolean')
    console.info(
      `${engine}: letter-spacing on Arabic applied = ${String(block?.letterSpacingApplied)}`,
    )
  })

  it('finds numbers and Latin words drawn out of order in RTL text, and not when isolated', async () => {
    const page = await facts(engine, {
      '/': arabicPage(`
        <p id="broken">اتصل بنا على +966 50 123 4567 الآن</p>
        <p id="fixed">اتصل بنا على <span dir="ltr">+966 50 123 4567</span> الآن</p>
        <p id="indic">رقمنا ٠٥٠ ١٢٣ ٤٥٦٧ للطلبات</p>
        <p id="code">نستخدم C++ في المشروع</p>
        <p id="bdi">نستخدم <bdi>C++</bdi> في المشروع</p>
        <p id="plain">تأسست الشركة عام 2010 ولديها 500 موظف</p>
        <p id="count">أكثر من +500 عميل</p>
        <p id="intl">اتصل على +966501234567 الآن</p>`),
    })
    // "+500" drawn as "500+" reads as "more than 500" either way, so short numbers after + do
    // not count; a phone number written with + does (M1.1 review).
    expect(page.bidi.map(({ selector, text, kind }) => ({ selector, text, kind }))).toEqual([
      { selector: '#broken', text: '+966 50 123 4567', kind: 'number' },
      { selector: '#indic', text: '٠٥٠ ١٢٣ ٤٥٦٧', kind: 'number' },
      { selector: '#code', text: 'C++', kind: 'latin' },
      { selector: '#intl', text: '+966501234567', kind: 'number' },
    ])
  })

  it('lists the elements that make the page wider than the screen', async () => {
    const page = await facts(engine, {
      '/': arabicPage(
        '<div id="wide" style="width: 600px">نص عريض</div><p>نص عادي</p>' +
          '<div style="overflow: hidden"><div style="width: 900px">مقصوص</div></div>',
      ),
    })
    expect(page.scrollWidth).toBeGreaterThan(390)
    expect(page.overflow.map((element) => element.selector)).toEqual(['#wide'])
  })

  it('leaves out elements past the start edge, which no one can scroll to (M1.1 review)', async () => {
    const page = await facts(engine, {
      '/': arabicPage(
        // Past the right edge of a right-to-left page: unreachable, and clipped (CSS Overflow 3).
        '<nav id="drawer" style="position: absolute; top: 0; right: -300px; width: 280px">قائمة</nav>' +
          '<div id="wide" style="width: 500px">نص عريض</div>',
      ),
    })
    expect(page.overflow.map((element) => element.selector)).toEqual(['#wide'])
  })

  it('takes the page direction from <body> when <html> has none, as CSS does (M1.1 review)', async () => {
    const page = await facts(engine, {
      '/': `<!doctype html><html lang="ar"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body dir="rtl" style="margin: 0"><div id="wide" style="width: 500px">نص عريض</div></body></html>`,
    })
    expect(page.dir).toBe('rtl')
    expect(page.overflow.map((element) => element.selector)).toEqual(['#wide'])
  })

  it('does not let a font that never arrives hold the render past its settle time (M1.1 review)', async () => {
    const site = await serve((req, res) => {
      if (req.url === '/slow.ttf') {
        // Headers and a first chunk, then nothing: the font stays loading.
        res.writeHead(200, { 'content-type': 'font/ttf', 'content-length': '100000' })
        res.write(Buffer.alloc(100))
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        arabicPage(
          `<p style="font-family: 'Slow Arabic', serif">نص عربي</p>`,
          `<style>@font-face { font-family: 'Slow Arabic'; src: url(/slow.ttf); }</style>`,
        ),
      )
    })
    cleanup.push(() => site.close())
    const [outcome] = await renderPage(site.url('/'), {
      engines: [engine],
      policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
      networkIsolated: true,
      timeoutMs: 20_000,
    })
    expect(outcome?.status, outcome?.error ?? '').toBe('rendered')
    expect(outcome?.facts?.arabicText).toHaveLength(1)
  })

  it('reports web fonts: loaded, failed, and their requests', async () => {
    const page = await facts(engine, {
      '/': arabicPage(
        `<p id="a" style="font-family: 'Web Arabic'">نص عربي</p>
         <p id="l" style="font-family: 'Web Latin', serif">نص عربي</p>
         <p id="m" style="font-family: 'Web Missing', serif">نص عربي</p>`,
        `<style>
          @font-face { font-family: 'Web Arabic'; src: url(/arabic.ttf); }
          @font-face { font-family: 'Web Latin'; src: url(/latin.ttf); }
          @font-face { font-family: 'Web Missing'; src: url(/missing.ttf); }
        </style>`,
      ),
      '/arabic.ttf': [200, { 'content-type': 'font/ttf' }, ARABIC_FONT],
      '/latin.ttf': [200, { 'content-type': 'font/ttf' }, LATIN_FONT],
    })
    const status = (family: string) => page.fontFaces.find((face) => face.family === family)?.status
    expect(status('Web Arabic')).toBe('loaded')
    expect(status('Web Latin')).toBe('loaded')
    expect(status('Web Missing')).toBe('error')
    const request = (file: string) => page.fontRequests.find((entry) => entry.url.endsWith(file))
    expect(request('/arabic.ttf')).toMatchObject({ status: 200, refused: false })
    expect(request('/missing.ttf')).toMatchObject({ status: 404, refused: false })
    expect(page.arabicText.map((block) => block.primaryFamily)).toEqual([
      'Web Arabic',
      'Web Latin',
      'Web Missing',
    ])
    if (engine !== 'chromium') {
      expect(page.usedFonts).toBeUndefined()
      return
    }
    const drew = (family: string) =>
      page.usedFonts
        ?.find((entry) => entry.fontFamily.includes(family))
        ?.fonts.filter((used) => used.custom)
        .map((used) => used.family)
    expect(drew('Web Arabic')).toEqual(['Arablyzer Test Arabic'])
    expect(drew('Web Latin')).toEqual([])
    expect(drew('Web Missing')).toEqual([])
  })

  it('reads the first family whole when its quoted name holds a comma (M1.1 review)', async () => {
    const page = await facts(engine, {
      '/': arabicPage(
        `<p style="font-family: 'Brand, Arabic', serif">نص عربي</p>
         <p style="font-family: &quot;Brand \\&quot;Two\\&quot;&quot;, serif">نص عربي</p>
         <p style="font-family: Plain Name, serif">نص عربي</p>`,
      ),
    })
    expect(page.arabicText.map((block) => block.primaryFamily)).toEqual([
      'Brand, Arabic',
      'Brand "Two"',
      'Plain Name',
    ])
  })

  it('takes a PNG of the first screen when asked', async () => {
    const outcome = await rendered(
      engine,
      { '/': arabicPage('<p>لقطة</p>') },
      { screenshots: true },
    )
    expect(outcome.screenshot?.subarray(0, 8)).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  })

  it('dismisses dialogs and closes pop-ups instead of waiting on them', async () => {
    const outcome = await rendered(engine, {
      '/': arabicPage('<p>نص</p><script>alert("x"); confirm("y"); window.open("/other")</script>'),
      '/other': arabicPage('<p>نافذة</p>'),
    })
    expect(outcome.status, outcome.error ?? '').toBe('rendered')
  })

  it('refuses requests past the limit, counted by the browser, which sees into tunnels (M1.1 review)', async () => {
    let served = 0
    const site = await serve((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(
          arabicPage(
            '<p>نص</p><script>for (let i = 0; i < 60; i++) fetch("/r" + i).catch(() => {})</script>',
          ),
        )
        return
      }
      served++
      res.end('ok')
    })
    cleanup.push(() => site.close())
    const [outcome] = await renderPage(site.url('/'), {
      engines: [engine],
      policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
      networkIsolated: true,
      maxRequests: 10,
    })
    expect(outcome?.status, outcome?.error ?? '').toBe('rendered')
    // The page itself is the first of the ten.
    expect(served).toBe(9)
    expect(outcome?.requests.limited).toBe(true)
    // The rules learn it too: a font cut at the limit is not the site's failure.
    expect(outcome?.facts?.limited).toBe(true)
  })

  it('starts no shared or service worker, whose requests the browser does not count (M1.1 CI)', async () => {
    // Engines tie neither kind's requests to the page, so no route sees them (measured in
    // Chromium: 30 of 30 past a limit of 10). Every request a worker makes names the document
    // that started it (realm=…), from the script's URL or its own.
    const reached: string[] = []
    const site = await serve((req, res) => {
      const path = new URL(req.url ?? '/', 'http://x').pathname
      if (path === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(
          arabicPage(`<p>نص</p><script>
const attempt = (start) => { try { Promise.resolve(start()).catch(() => {}) } catch {} };
const blob = (body) => URL.createObjectURL(new Blob([body], { type: 'text/javascript' }));
const frame = document.createElement('iframe');
document.body.append(frame);
for (const [where, realm] of [['page', window], ['frame', frame.contentWindow], ['pop-up', window.open('about:blank')]]) {
  attempt(() => new realm.SharedWorker('/shared.js?realm=' + where));
  attempt(() => new realm.SharedWorker(blob('fetch(' + JSON.stringify(location.origin + '/from-blob?realm=' + where) + ')')));
  attempt(() => realm.navigator.serviceWorker.register('/sw.js?realm=' + where));
  attempt(() => realm.ServiceWorkerContainer.prototype.register.call(realm.navigator.serviceWorker, '/sw.js?by=prototype&realm=' + where));
}
</script>`),
        )
        return
      }
      if (path !== '/favicon.ico') reached.push(req.url ?? '')
      res.writeHead(200, { 'content-type': 'text/javascript' })
      if (path === '/shared.js') res.end('fetch("/from-shared" + location.search)')
      else if (path === '/sw.js') {
        res.end(
          `self.addEventListener('install', (e) => e.waitUntil(fetch('/from-sw' + location.search)))`,
        )
      } else res.end('')
    })
    cleanup.push(() => site.close())
    const [outcome] = await renderPage(site.url('/'), {
      engines: [engine],
      policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
      networkIsolated: true,
    })
    expect(outcome?.status, outcome?.error ?? '').toBe('rendered')
    // The guard ran first in the page and, in every engine, in the first document of a new frame
    // and of a pop-up, which the page reaches at once (CI run 36282666726).
    expect(reached).toEqual([])
  })

  it('lets nothing out past the limit while the browser closes (M1.1 CI)', async () => {
    // A request still waiting for the route when the page closes is let go by the browser, and
    // a beacon outlives its page: in Chromium's headless shell, 1 or 2 went out past the limit
    // in each of 3 runs, after the proxy's count was taken.
    let beacons = 0
    const site = await serve((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(
          arabicPage(
            '<p>نص</p><script>let i = 0; setInterval(() => navigator.sendBeacon("/b?" + i++, "x"), 5)</script>',
          ),
        )
        return
      }
      beacons++
      res.end('')
    })
    cleanup.push(() => site.close())
    const [outcome] = await renderPage(site.url('/'), {
      engines: [engine],
      policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
      networkIsolated: true,
      maxRequests: 10,
    })
    expect(outcome?.status, outcome?.error ?? '').toBe('rendered')
    // Anything the closing browser still sent would have arrived by now.
    await new Promise((resolve) => setTimeout(resolve, 500))
    // The page itself is the first of the ten.
    expect(beacons).toBeLessThanOrEqual(9)
  })

  it('records whether a dedicated worker can start a service worker (M1.1 CI)', async () => {
    // Init scripts do not run in workers, so the page's own guard cannot reach one. Chromium
    // gives workers no navigator.serviceWorker. Firefox and WebKit let them register, and the
    // service worker's 30 requests all went out with a limit of 10 (CI run 36282666726).
    let registered = false
    let fetched = 0
    const site = await serve((req, res) => {
      const path = new URL(req.url ?? '/', 'http://x').pathname
      if (path === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(arabicPage(`<p>نص</p><script>new Worker('/worker.js')</script>`))
        return
      }
      res.writeHead(200, { 'content-type': 'text/javascript' })
      if (path === '/worker.js') {
        res.end(`try { navigator.serviceWorker.register('/sw.js').catch(() => {}) } catch {}`)
      } else if (path === '/sw.js') {
        registered = true
        res.end(`self.addEventListener('install', (e) => e.waitUntil(Promise.all(
  Array.from({ length: 30 }, (_, i) => fetch('/from-sw?' + i).catch(() => {})))))`)
      } else {
        if (path === '/from-sw') fetched++
        res.end('')
      }
    })
    cleanup.push(() => site.close())
    const [outcome] = await renderPage(site.url('/'), {
      engines: [engine],
      policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
      networkIsolated: true,
      maxRequests: 10,
    })
    expect(outcome?.status, outcome?.error ?? '').toBe('rendered')
    console.info(
      `${engine}: a dedicated worker registered a service worker = ${String(registered)}, ` +
        `which sent ${String(fetched)} of 30 requests with a limit of 10`,
    )
    if (engine === 'chromium') expect(registered).toBe(false)
  })

  it('stops at its time budget when the page blocks its own main thread', async () => {
    const started = performance.now()
    const outcome = await rendered(
      engine,
      { '/': arabicPage('<p>نص</p><script>setTimeout(() => { for (;;) {} }, 0)</script>') },
      { timeoutMs: 4_000 },
    )
    expect(outcome.status).toBe('timeout')
    expect(performance.now() - started).toBeLessThan(15_000)
  })

  it('says when the engine is not installed', async () => {
    const outcome = await rendered(
      engine,
      { '/': arabicPage('<p>نص</p>') },
      { executablePaths: { [engine]: '/nonexistent/browser' } },
    )
    expect(outcome).toMatchObject({ status: 'unavailable', facts: null })
  })
})
