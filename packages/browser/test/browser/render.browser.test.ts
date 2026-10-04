import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { inRanges, type Engine } from '@arablyzer/collectors'
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
const PARTIAL_FONT = font('arablyzer-test-arabic-partial.woff2')

function arabicPage(body: string, head = ''): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">${head}</head>
<body style="margin: 0; font-family: serif">${body}</body></html>`
}

/** The text in windows-1256, which Node cannot encode: each byte by what it decodes to. */
function windows1256(text: string): Buffer {
  const decoder = new TextDecoder('windows-1256')
  const bytes = new Map<string, number>()
  for (let byte = 0; byte < 256; byte++) bytes.set(decoder.decode(Uint8Array.of(byte)), byte)
  return Buffer.from(
    Array.from(text, (character) => {
      const byte = bytes.get(character)
      if (byte === undefined) throw new Error(`${character} is not in windows-1256`)
      return byte
    }),
  )
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

  it('reads the fonts and stylesheets the page loaded: coverage, and sides set by left or right', async () => {
    const css = `@font-face { font-family: 'Partial'; src: url(/partial.woff2) format('woff2'); }
.card { margin-left: 12px; font-family: 'Partial', serif }
[dir=rtl] .card { margin-right: 12px }`
    const page = await facts(engine, {
      '/': arabicPage(
        `<p id="a" class="card">ڤيلا بسعر ١٠٠ ريال</p>
         <p style="float: right; font-family: 'Inline Arabic'">نص عربي</p>`,
        `<link rel="stylesheet" href="/site.css">
         <style>
           @font-face { font-family: 'Inline Arabic'; src: url(/arabic.ttf); }
           .x { padding-right: 4px }
         </style>`,
      ),
      // Compressed, with Timing-Allow-Origin not needed on the page's own origin.
      '/site.css': [200, { 'content-type': 'text/css', 'content-encoding': 'gzip' }, gzipSync(css)],
      '/partial.woff2': [200, { 'content-type': 'font/woff2' }, PARTIAL_FONT],
      '/arabic.ttf': [200, { 'content-type': 'font/ttf' }, ARABIC_FONT],
    })
    const partial = page.arabicFontCoverage.find((entry) => entry.family === 'Partial')
    expect(partial?.unknown).toEqual([])
    expect(inRanges(partial?.covered ?? [], 0x627)).toBe(true)
    expect(inRanges(partial?.covered ?? [], 0x6a4)).toBe(false)
    expect(inRanges(partial?.covered ?? [], 0x661)).toBe(false)
    const inline = page.arabicFontCoverage.find((entry) => entry.family === 'Inline Arabic')
    expect(inRanges(inline?.covered ?? [], 0x6a4)).toBe(true)
    expect(page.arabicText.find((block) => block.selector === '#a')?.arabicCharacters).toBe(
      'ابرسعلي٠١ڤ',
    )
    expect(page.stylesheets).toMatchObject({ read: 2, unread: 0 })
    expect(page.stylesheets.physical).toEqual([
      {
        url: expect.stringMatching(/\/site\.css$/) as string,
        inline: false,
        count: 1,
        examples: [
          { selector: '.card', property: 'margin-left', value: '12px', line: 2, column: 9 },
        ],
      },
      expect.objectContaining({ inline: true, count: 1 }),
    ])
  })

  it('does not read a compressed file whose size cannot be known beforehand', async () => {
    // From another origin, compressed: 8 MB once decoded without Timing-Allow-Origin, so no size
    // is known; and a small one with it.
    const cdn = await serve(
      pages({
        '/big.css': [
          200,
          { 'content-type': 'text/css', 'content-encoding': 'gzip' },
          gzipSync(Buffer.from(`/*${' '.repeat(8 * 1024 * 1024)}*/ .a { margin-left: 1px }`)),
        ],
        '/small.css': [
          200,
          {
            'content-type': 'text/css',
            'content-encoding': 'gzip',
            'timing-allow-origin': '*',
          },
          gzipSync('.b { padding-left: 2px }'),
        ],
      }),
    )
    cleanup.push(() => cdn.close())
    const site = await serve(
      pages({
        '/': arabicPage(
          '<p class="a">نص عربي</p>',
          `<link rel="stylesheet" href="${cdn.url('/big.css')}">
           <link rel="stylesheet" href="${cdn.url('/small.css')}">`,
        ),
      }),
    )
    cleanup.push(() => site.close())
    const [outcome] = await renderPage(site.url('/'), {
      engines: [engine],
      policy: createPolicy({
        allowTargets: [
          { address: '127.0.0.1', port: site.port },
          { address: '127.0.0.1', port: cdn.port },
        ],
      }),
      networkIsolated: true,
    })
    expect(outcome?.status, outcome?.error ?? '').toBe('rendered')
    const stylesheets = outcome?.facts?.stylesheets
    // Firefox and WebKit follow Fetch in hiding the size of another origin's stylesheet linked
    // without crossorigin, even with Timing-Allow-Origin: there both stay unread (WebKit measured
    // in CI). Chromium gives it. The large one is never read.
    expect(stylesheets).toEqual(
      engine === 'chromium'
        ? {
            read: 1,
            unread: 1,
            physical: [expect.objectContaining({ url: cdn.url('/small.css'), count: 1 })],
          }
        : { read: 0, unread: 2, physical: [] },
    )
  })

  it('trusts a size named by URL only for a URL loaded once, which a page cannot hide', async () => {
    // The page loads its stylesheet's URL again, and keeps the second load out of Resource Timing
    // with a buffer of one entry: a size named by that URL no longer says which body it is.
    let served = 0
    const site = await serve((req, res) => {
      if (new URL(req.url ?? '/', 'http://x').pathname === '/s.css') {
        served++
        res.writeHead(200, {
          'content-type': 'text/css',
          'content-encoding': 'gzip',
          'cache-control': 'no-store',
        })
        res.end(gzipSync(served === 1 ? '.a { margin-left: 1px }' : '.b { float: left }'))
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(
        arabicPage(
          '<p class="a">نص عربي</p>',
          `<link rel="stylesheet" href="/s.css">
           <script>
             addEventListener('load', () => {
               performance.setResourceTimingBufferSize(1)
               fetch('/s.css', { cache: 'no-store' })
             })
           </script>`,
        ),
      )
    })
    cleanup.push(() => site.close())
    const [outcome] = await renderPage(site.url('/'), {
      engines: [engine],
      policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
      networkIsolated: true,
    })
    expect(outcome?.status, outcome?.error ?? '').toBe('rendered')
    expect(served).toBe(2)
    expect(outcome?.facts?.stylesheets).toEqual({ read: 0, unread: 1, physical: [] })
  })

  it('gzips the text that came uncompressed, and gives each drawn image its type and size', async () => {
    const script = `window.catalog = ${JSON.stringify(Array.from({ length: 300 }, (_, i) => ({ id: i, name: 'منتج عربي' })))}`
    const png = readFileSync(
      fileURLToPath(
        new URL(
          '../../../rules/src/rules/image-format-legacy/fixtures/wrong/images/sadu.png',
          import.meta.url,
        ),
      ),
    )
    const page = await facts(engine, {
      '/': arabicPage(
        '<p>نص عربي</p><img id="sadu" src="/sadu.png" width="128" height="128" alt="نقش">',
        '<script src="/app.js"></script><link rel="stylesheet" href="/site.css">',
      ),
      '/app.js': [200, { 'content-type': 'text/javascript' }, script],
      '/site.css': [
        200,
        { 'content-type': 'text/css', 'content-encoding': 'gzip' },
        gzipSync('p { color: #222 }'),
      ],
      '/sadu.png': [200, { 'content-type': 'image/png' }, png],
    })
    const uncompressed = page.compression.uncompressed.map((text) => [
      new URL(text.url).pathname,
      text.type,
      text.size,
    ])
    expect(uncompressed).toEqual(
      expect.arrayContaining([
        ['/', 'document', expect.any(Number)],
        ['/app.js', 'script', Buffer.byteLength(script)],
      ]),
    )
    expect(page.compression.uncompressed.every((text) => text.gzipSize < text.size)).toBe(true)
    // The document, the script and the stylesheet, which came gzipped.
    expect(page.compression.checked).toBe(3)
    expect(page.images).toEqual([
      expect.objectContaining({
        selector: '#sadu',
        naturalWidth: 128,
        naturalHeight: 128,
        type: 'image/png',
        size: png.length,
      }),
    ])
  })

  it('reads text in a legacy encoding as it was sent, or leaves it out when the engine re-encoded it', async () => {
    const stylesheet = windows1256('.عنوان { margin-left: 4px }')
    const script = windows1256(`window.title = "${'عنوان عربي '.repeat(200)}"`)
    const page = await facts(engine, {
      '/': arabicPage(
        '<p class="عنوان">نص عربي</p>',
        '<link rel="stylesheet" href="/site.css"><script src="/app.js"></script>',
      ),
      '/site.css': [200, { 'content-type': 'text/css; charset=windows-1256' }, stylesheet],
      '/app.js': [200, { 'content-type': 'text/javascript; charset=windows-1256' }, script],
    })
    // Chromium hands both re-encoded as UTF-8, Firefox as sent (measured 2026-09-27): the
    // stylesheet reads the same either way, and the script is gzipped only as it was sent.
    expect(page.stylesheets.physical[0]?.examples[0]?.selector).toBe('.عنوان')
    const sent = page.compression.uncompressed.filter((text) => text.url.endsWith('/app.js'))
    expect(sent).toEqual(
      engine === 'firefox'
        ? [expect.objectContaining({ mimeType: 'text/javascript', size: script.length })]
        : [],
    )
  })

  it('gives an image chosen by srcset or <picture> the size of its file, not divided by its density', async () => {
    const png = readFileSync(
      fileURLToPath(
        new URL(
          '../../../rules/src/rules/image-format-legacy/fixtures/wrong/images/sadu.png',
          import.meta.url,
        ),
      ),
    )
    const image = [200, { 'content-type': 'image/png' }, png] as const
    const page = await facts(engine, {
      '/': arabicPage(
        `<img id="x2" srcset="/x2.png 2x" alt="نقش">
         <img id="w" srcset="/w.png 1024w" sizes="100vw" alt="نقش">
         <picture><source srcset="/pic.png 3x"><img id="pic" src="/fallback.png" alt="نقش"></picture>`,
      ),
      '/x2.png': image,
      '/w.png': image,
      '/pic.png': image,
      '/fallback.png': image,
    })
    // The file is 128 × 128; the elements themselves say 64, 48 and 42. Each is given the file's
    // size, or left out when the engine does not have the file at hand: Firefox, in the render
    // (measured 2026-09-27). Never the element's own size, which would shrink the estimate.
    const sizes = page.images.map((drawn) => [
      drawn.selector,
      drawn.naturalWidth,
      drawn.naturalHeight,
    ])
    expect(sizes.every(([, width, height]) => width === 128 && height === 128)).toBe(true)
    if (engine === 'chromium') {
      expect(sizes.map(([selector]) => selector)).toEqual(['#x2', '#w', '#pic'])
    }
  })

  it('finds direction icons drawn as for left-to-right text in right-to-left text', async () => {
    const icon = 'display: inline-block; width: 12px; height: 12px'
    const page = await facts(engine, {
      '/': arabicPage(
        `<p><i id="fa" class="fa-solid fa-arrow-right" style="${icon}"></i> التالي</p>
         <p><i class="fa-solid fa-chevron-right" style="${icon}; transform: scaleX(-1)"></i> التالي</p>
         <p style="transform: rotate(180deg)"><i class="bi-caret-right-fill" style="${icon}"></i></p>
         <p><i class="fa-solid fa-arrow-left" style="${icon}"></i> السابق</p>
         <p><span id="ms" class="material-symbols-outlined">arrow_forward</span></p>
         <p id="more">اقرأ المزيد →</p>
         <p><a href="/offers">كل العروض <span id="alone">→</span></a></p>
         <p>Next →</p>
         <p dir="ltr"><i class="bi-arrow-right" style="${icon}"></i> Next →</p>`,
      ),
    })
    expect(page.directionIcons.map((found) => [found.selector, found.name])).toEqual([
      ['#fa', 'fa-arrow-right'],
      ['#ms', 'arrow_forward'],
      ['#more', '→'],
      ['#alone', '→'],
    ])
    expect(page.directionIcons[2]?.box.width).toBeLessThan(40)
  })

  it('finds a control whose icon points against what it says it does, in right-to-left text', async () => {
    const icon = 'display: inline-block; width: 12px; height: 12px'
    const page = await facts(engine, {
      '/': arabicPage(
        `<a href="/2" class="next">التالي <i id="wrong" class="fa-solid fa-arrow-right" style="${icon}"></i></a>
         <a href="/3" class="next">التالي <i class="fa-solid fa-arrow-right" style="${icon}; transform: scaleX(-1)"></i></a>
         <a href="/4">التالي <i class="fa-solid fa-arrow-left" style="${icon}"></i></a>
         <a href="/5" id="back">رجوع <span id="char">←</span></a>
         <a href="/6">رجوع <i class="fa-solid fa-arrow-right" style="${icon}"></i></a>
         <a href="/7" dir="ltr">Next <i class="fa-solid fa-arrow-right" style="${icon}"></i></a>
         <a href="/8">اقرأ المزيد <i class="fa-solid fa-chevron-down" style="${icon}"></i></a>`,
      ),
    })
    expect(page.roleIcons.map((found) => [found.selector, found.role, found.pointing])).toEqual([
      ['#wrong', 'next', 'right'],
      ['#char', 'prev', 'left'],
    ])
    // A stylesheet that sets what the class draws for right-to-left text: the class says nothing.
    const swapped = await facts(engine, {
      '/': arabicPage(
        `<style>[dir='rtl'] .fa-arrow-right::before { content: 'L' }</style>
         <a href="/2">التالي <i class="fa-solid fa-arrow-right" style="${icon}"></i></a>`,
      ),
    })
    expect(swapped.roleIcons).toEqual([])
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

  it('runs axe-core’s curated rules, contrast of Arabic text included, which axe alone skips', async () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC'
    const page = await facts(engine, {
      '/': arabicPage(`<main>
<p style="color:#222">نص داكن أول على خلفية بيضاء</p>
<p style="color:#222">نص داكن ثان على خلفية بيضاء</p>
<p style="color:#222">نص داكن ثالث على خلفية بيضاء</p>
<p id="low" style="color:#aaaaaa;background:#ffffff">نص رمادي فاتح على خلفية بيضاء</p>
<p id="lowen" style="color:#aaaaaa;background:#ffffff">Light grey English text</p>
<p id="over" style="color:#ffffff;background-image:url(${png});background-size:cover">نص أبيض فوق صورة</p>
<img id="noalt" src="${png}" width="40" height="40">
<a id="emptylink" href="/cart"><svg aria-hidden="true" width="10" height="10"></svg></a>
<button id="emptybtn"><span></span></button>
<p id="badlang" lang="arabic">نص بلغة غير صالحة</p>
<input id="nolabel" name="phone">
<label>الاسم <input id="labelled" name="name"></label>
</main>`),
    })
    const a11y = page.a11y
    if (a11y === null) throw new Error('axe did not run')
    const violations = Object.fromEntries(
      a11y.rules.map((rule) => [rule.id, rule.violations.map((node) => node.selector)]),
    )
    expect(violations).toEqual({
      'image-alt': ['#noalt'],
      'color-contrast': ['#low', '#lowen'],
      'link-name': ['#emptylink'],
      'button-name': ['#emptybtn'],
      'valid-lang': ['#badlang'],
      label: ['#nolabel'],
    })
    const contrast = a11y.rules.find((rule) => rule.id === 'color-contrast')
    expect(contrast?.violations[0]?.contrast).toMatchObject({ ratio: 2.32, expected: 4.5 })
    expect(contrast?.incomplete.map((node) => [node.selector, node.reason])).toEqual([
      ['#over', 'bgImage'],
    ])
    expect(a11y.rules.every((rule) => rule.applicable)).toBe(true)
    expect(a11y.axeVersion).toBe('4.13.0')
  })

  it('says which axe rules had nothing to check on the page', async () => {
    const page = await facts(engine, { '/': arabicPage('<p>نص عربي قصير</p>') })
    const applicable = Object.fromEntries(
      (page.a11y?.rules ?? []).map((rule) => [rule.id, rule.applicable]),
    )
    expect(applicable).toEqual({
      'image-alt': false,
      'color-contrast': true,
      'link-name': false,
      'button-name': false,
      'valid-lang': false,
      label: false,
    })
  })

  it('lets no large result reach Node when the page poisons the built-ins our scripts use (M1.2b review)', async () => {
    const outcome = await rendered(engine, {
      '/': arabicPage(
        '<p>نص عربي</p><script>String.prototype.slice = function () { return "x".repeat(1000000) }</script>',
      ),
    })
    expect(outcome.status).toBe('failed')
    expect(outcome.error).toMatch(/over the limit/)
  })

  it('keeps axe’s results out, and the rest of the facts, when the page stands in for axe (M1.2b review)', async () => {
    const fake = `{
      _cache: { set() {} },
      run: async () => ({
        violations: [{ id: 'image-alt', nodes: { slice: () => Array.from({ length: 100000 }, () => ({ target: ['#x'], html: '<img>', any: [], all: [], none: [] })) } }],
        incomplete: [],
        inapplicable: [],
      }),
    }`
    const page = await facts(engine, {
      '/': arabicPage(
        `<p>نص عربي</p><img src="/x.png"><script>Object.defineProperty(window, 'axe', { get: () => (${fake}), set() {} })</script>`,
      ),
    })
    expect(page.a11y).toBeNull()
    expect(page.arabicText.length).toBeGreaterThan(0)
  })

  it('reports text fields with their computed direction', async () => {
    const page = await facts(engine, {
      '/': arabicPage(`<form>
<label for="p1">رقم الجوال</label><input id="p1" name="phone" inputmode="tel">
<input id="p2" type="tel" name="mobile">
<input id="p3" name="whatsapp" dir="ltr">
<textarea id="t1" name="notes"></textarea>
<input type="hidden" name="token" value="x"><input type="checkbox" name="agree">
</form>`),
    })
    const fields = Object.fromEntries(
      page.fields.map((field) => [field.selector, [field.type, field.direction, field.label]]),
    )
    expect(fields['#p1']).toEqual(['text', 'rtl', 'رقم الجوال'])
    expect(fields['#p3']).toEqual(['text', 'ltr', null])
    expect(fields['#t1']).toEqual(['textarea', 'rtl', null])
    expect(Object.keys(fields)).toEqual(['#p1', '#p2', '#p3', '#t1'])
    // Measured in all three: Chromium 153 and Firefox 155 here, WebKit 26.6 in CI (run 36295996310).
    expect(fields['#p2']?.[1]).toBe('ltr')
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
    // window.open gives the page nothing (see SEND_GUARD); a link with a target opens a pop-up all
    // the same, and the render closes it.
    const outcome = await rendered(engine, {
      '/': arabicPage(
        '<p>نص</p><a id="l" href="/other" target="_blank">رابط</a><script>alert("x"); confirm("y"); window.open("/other"); document.getElementById("l").click()</script>',
      ),
      '/other': arabicPage('<p>نافذة</p>'),
    })
    expect(outcome.status, outcome.error ?? '').toBe('rendered')
    expect(outcome.facts?.url.endsWith('/')).toBe(true)
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
    // The report counts what the page made, as the browser saw it: the proxy never sees the
    // requests refused past the limit, nor those inside an HTTPS tunnel (the owner's sites).
    const made = outcome?.pageRequests.made ?? 0
    expect(made).toBeGreaterThanOrEqual(61)
    expect(made - (outcome?.pageRequests.overLimit ?? 0)).toBe(10)
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
    // and of a pop-up, which the page reached at once (CI run 36282666726). It cannot now: window.open
    // gives back null (see SEND_GUARD), and that realm's attempts throw where they start.
    expect(reached).toEqual([])
  })

  it('lets nothing out past the limit while the browser closes (M1.1 CI)', async () => {
    // A request still waiting for the route when the page closes is let go by the browser, and
    // a beacon outlives its page: in Chromium's headless shell, 1 or 2 went out past the limit
    // in each of 3 runs, after the proxy's count was taken. A beacon is a POST, which the render
    // now refuses whatever the limit (see the sending suite); a keepalive request outlives its
    // page in the same way, and a GET is one the render lets out.
    let beacons = 0
    const site = await serve((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(
          arabicPage(
            '<p>نص</p><script>let i = 0; setInterval(() => fetch("/b?" + i++, { keepalive: true }).catch(() => {}), 5)</script>',
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

  it('starts no dedicated worker, which could start a service worker whose requests no route sees (M1.1 CI, M1 review)', async () => {
    // Init scripts do not run in workers, so the page's own guard cannot reach one. Chromium gives
    // workers no navigator.serviceWorker. Firefox and WebKit let them register, and the service
    // worker's 30 requests all went out with a limit of 10 (CI run 36282666726), any method and to
    // any host, since no route sees them. So there is no dedicated worker (see SEND_GUARD).
    const asked: string[] = []
    const site = await serve((req, res) => {
      const path = new URL(req.url ?? '/', 'http://x').pathname
      if (path === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(
          arabicPage(
            `<p>نص</p><script>
              // The page says what it found, by a GET to its own site.
              let found = typeof Worker;
              try { new Worker('/worker.js') } catch (error) { found += ' ' + error.name }
              fetch('/found?' + encodeURIComponent(found));
            </script>`,
          ),
        )
        return
      }
      if (path !== '/favicon.ico') asked.push(decodeURIComponent(req.url ?? ''))
      res.writeHead(200, { 'content-type': 'text/javascript' })
      if (path === '/worker.js') {
        res.end(`try { navigator.serviceWorker.register('/sw.js').catch(() => {}) } catch {}`)
      } else if (path === '/sw.js') {
        res.end(`self.addEventListener('install', (e) => e.waitUntil(Promise.all(
  Array.from({ length: 30 }, (_, i) => fetch('/from-sw?' + i).catch(() => {})))))`)
      } else res.end('')
    })
    cleanup.push(() => site.close())
    const [outcome] = await renderPage(site.url('/'), {
      engines: [engine],
      policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
      networkIsolated: true,
      maxRequests: 10,
    })
    expect(outcome?.status, outcome?.error ?? '').toBe('rendered')
    // The page found no Worker, and its worker's script was never asked for, nor the service worker's.
    expect(asked).toEqual(['/found?undefined ReferenceError'])
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

// M2.3c review: the plain fetch can pass a page whose browser is answered a challenge, and a
// challenge's script, once run, may get past it (BUILD-PLAN §13). The render stops at the answer's
// headers, checked with the same challengeOf the engine uses, and lets nothing the page asks for
// go out after it (see watchDocuments).
describe.each(engines)('a bot challenge in place of the page: %s', (engine) => {
  const HEADERS = { 'content-type': 'text/html; charset=UTF-8' }
  /** A challenge page as a service sends one: an inline script and a script file, both beacons. */
  const CHALLENGE =
    '<!doctype html><html><head><title>Just a moment...</title></head><body><p>Checking</p><script>fetch("/ran-inline")</script><script src="/challenge.js"></script></body></html>'
  const SCRIPT = [200, { 'content-type': 'text/javascript' }, 'fetch("/ran-file")'] as const

  /** Renders `/` of a site with these routes; what the site was asked for, less the favicon. */
  async function visited(
    routes: Parameters<typeof pages>[0],
    options: Partial<RenderOptions> = {},
  ) {
    const asked: string[] = []
    const answer = pages(routes)
    const site = await serve((req, res) => {
      if (req.url !== '/favicon.ico') asked.push(req.url ?? '')
      answer(req, res)
    })
    cleanup.push(() => site.close())
    const [outcome] = await renderPage(site.url('/'), {
      engines: [engine],
      policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
      networkIsolated: true,
      ...options,
    })
    if (outcome === undefined) throw new Error('No outcome')
    // Anything a script had started would have reached the site by now.
    await new Promise((resolve) => setTimeout(resolve, 300))
    return { outcome, asked }
  }

  it.each([
    ['Cloudflare', 403, { 'cf-mitigated': 'challenge' }],
    ['AWS WAF', 202, { 'x-amzn-waf-action': 'challenge' }],
  ])('measures no %s challenge as the page', async (service, status, header) => {
    const { outcome, asked } = await visited({
      '/': [status, { ...HEADERS, ...header }, CHALLENGE],
      '/challenge.js': SCRIPT,
    })
    expect(outcome.status, outcome.error ?? '').toBe('challenged')
    expect(outcome.challenge).toEqual({ service, status })
    expect(outcome.error).toContain(service)
    expect(outcome.facts).toBeNull()
    expect(outcome.screenshot).toBeNull()
    // The script file may be asked for as the engine reports the answer, but what it asks for
    // once it runs goes nowhere: a challenge is passed by that (see watchDocuments).
    expect(asked[0]).toBe('/')
    expect(asked).not.toContain('/ran-file')
  })

  it('runs the same page, and its scripts, when the site sends it as the page', async () => {
    const { outcome, asked } = await visited({
      '/': [200, HEADERS, CHALLENGE],
      '/challenge.js': SCRIPT,
    })
    expect(outcome.status, outcome.error ?? '').toBe('rendered')
    expect(outcome.challenge).toBeNull()
    expect(asked).toEqual(
      expect.arrayContaining(['/', '/ran-inline', '/challenge.js', '/ran-file']),
    )
  })

  it('meets a challenge at the end of a redirect, and one a page navigates to', async () => {
    const challenge = [403, { ...HEADERS, 'cf-mitigated': 'challenge' }, CHALLENGE] as const
    const redirect = await visited({
      '/': [302, { location: '/c' }, ''],
      '/c': challenge,
    })
    expect(redirect.outcome.status, redirect.outcome.error ?? '').toBe('challenged')
    expect(redirect.asked.slice(0, 2)).toEqual(['/', '/c'])
    expect(redirect.asked).not.toContain('/ran-file')

    const navigated = await visited({
      '/': arabicPage('<p>نص</p><script>setTimeout(() => location.assign("/c"), 50)</script>'),
      '/c': challenge,
    })
    expect(navigated.outcome.status, navigated.outcome.error ?? '').toBe('challenged')
    expect(navigated.outcome.challenge).toEqual({ service: 'Cloudflare', status: 403 })
    expect(navigated.asked.slice(0, 2)).toEqual(['/', '/c'])
    expect(navigated.asked).not.toContain('/ran-file')
  })

  it('follows redirects to the page as before, and measures where they end', async () => {
    const page = arabicPage('<p id="a">مرحبا بكم</p>')
    const started = await visited({
      '/': [301, { location: '/one' }, ''],
      '/one': [302, { location: '/two' }, ''],
      '/two': page,
    })
    expect(started.outcome.status, started.outcome.error ?? '').toBe('rendered')
    expect(started.outcome.facts?.url.endsWith('/two')).toBe(true)
    expect(started.outcome.facts?.status).toBe(200)
    expect(started.asked).toEqual(['/', '/one', '/two'])
  })

  it('leaves a document the site refuses without a challenge to the browser, as it was', async () => {
    const { outcome } = await visited({
      '/': [403, HEADERS, arabicPage('<p>ممنوع</p>')],
    })
    expect(outcome.status, outcome.error ?? '').toBe('rendered')
    expect(outcome.facts).toMatchObject({ status: 403 })
  })
})
