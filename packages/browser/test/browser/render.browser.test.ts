import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Engine } from '@arablyzer/collectors'
import { createPolicy } from '@arablyzer/egress'
import { afterEach, describe, expect, it } from 'vitest'
import { renderPage, type RenderOptions, type RenderOutcome } from '../../src/index'
import { enginesUnderTest, pages, serve } from './helpers'

const engines = await enginesUnderTest()
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
        <p id="plain">تأسست الشركة عام 2010 ولديها 500 موظف</p>`),
    })
    expect(page.bidi.map(({ selector, text, kind }) => ({ selector, text, kind }))).toEqual([
      { selector: '#broken', text: '+966 50 123 4567', kind: 'number' },
      { selector: '#indic', text: '٠٥٠ ١٢٣ ٤٥٦٧', kind: 'number' },
      { selector: '#code', text: 'C++', kind: 'latin' },
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
