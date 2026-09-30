import { describe, expect, it } from 'vitest'
import { collectPageIsolated, ISOLATED_HEAP_MB } from '../src/isolated'
import { collectPage, type CollectOptions, type PageInput } from '../src/page'
import { encodeSingleByte, utf8 } from './helpers'

// H1 of the pre-launch review: a page whose tree outgrows the heap ended the whole scanner
// process. The scanner reads pages in a thread of its own, with a heap of its own and a clock that
// can stop it, so a page that is too much for it is too complex, and nothing more.

const HTML = [['content-type', 'text/html; charset=utf-8']] as const

/** A thread starts, registers tsx and loads the collector before it reads: room for a busy machine. */
const ROOM = { timeout: 60_000 }

function page(body: string | Uint8Array, headers: PageInput['headers'] = HTML): PageInput {
  return {
    url: 'https://example.com/',
    status: 200,
    headers,
    body: typeof body === 'string' ? utf8(body) : body,
  }
}

/** A page with something for every collector to read. */
const RICH = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>متجر الكتب</title>
  <meta name="description" content="أفضل الكتب العربية">
  <link rel="canonical" href="/books">
  <script>window.dataLayer = []</script>
  <script type="application/ld+json">{"@type":"Store"}</script>
</head>
<body>
  <h1>مرحبا بكم</h1>
  <p>نص عربي مع <a href="/about">رابط</a> و<a href="http://example.com/x">رابط آخر</a>.</p>
  <img src="/a.png" alt="غلاف الكتاب">
  <svg><title>شعار</title></svg>
  <form action="/join"><label for="n">الاسم</label><input id="n" name="name" autocomplete="name"></form>
</body>
</html>`

describe('collectPageIsolated', () => {
  it('gives the facts collectPage gives, for the same page', ROOM, async () => {
    const cases: [what: string, input: PageInput, options: CollectOptions][] = [
      ['a page with something for every collector', page(RICH), {}],
      // Another encoding, read from the bytes the thread is given.
      [
        'windows-1256',
        page(
          encodeSingleByte(
            '<html lang="ar"><head><meta charset="windows-1256"></head><body><p>مرحبا</p></body></html>',
            'windows-1256',
          ),
          [['content-type', 'text/html']],
        ),
        {},
      ],
      ['XHTML', page(RICH, [['content-type', 'application/xhtml+xml']]), {}],
      // Not HTML: there is nothing to read, and no thread to read it.
      ['JSON', page('{"a":1}', [['content-type', 'application/json']]), {}],
      // Only the first bytes are read.
      ['a page cut short', page(RICH), { maxHtmlBytes: 400 }],
    ]
    for (const [what, input, options] of cases) {
      const isolated = await collectPageIsolated(input, { timeoutMs: 30_000, ...options })
      expect(isolated, what).toEqual(collectPage(input, options))
    }
    const cut = collectPage(page(RICH), { maxHtmlBytes: 400 })
    expect(cut.htmlTruncated).toBe(true)
    expect(cut.html).not.toBeNull()
  })

  it('applies the limits on nodes and nesting in its thread too', ROOM, async () => {
    const wide = await collectPageIsolated(page(`<body>${'<p>'.repeat(300)}`), {
      timeoutMs: 30_000,
      maxNodes: 100,
    })
    expect(wide).toMatchObject({ isHtml: true, html: null, text: null, htmlTooComplex: true })
    const deep = await collectPageIsolated(page(`<body>${'<div>'.repeat(300)}`), {
      timeoutMs: 30_000,
      maxDepth: 100,
    })
    expect(deep).toMatchObject({ isHtml: true, html: null, text: null, htmlTooComplex: true })
  })

  // The tree of this page fits under every limit of the collector: 130,000 links, none of them
  // more than the 200,000 nodes it may hold. Read in the thread's heap it needs some 450 MB.
  it(
    'gives up on a page whose tree outgrows the heap it is given, and its process lives on',
    ROOM,
    async () => {
      const href = `/${'a'.repeat(70)}`
      const heavy = page(`<body>${`<a href="${href}" class="c">ب</a>`.repeat(130_000)}`)
      const started = performance.now()
      const facts = await collectPageIsolated(heavy, { timeoutMs: 60_000, maxHeapMb: 128 })
      expect(facts).toMatchObject({ isHtml: true, html: null, text: null, htmlTooComplex: true })
      expect(performance.now() - started).toBeLessThan(20_000)
      // The heap is the thread's: this process reads the same page, given more.
      const roomy = await collectPageIsolated(page('<body><p>ب</p>'), { timeoutMs: 30_000 })
      expect(roomy.htmlTooComplex).toBe(false)
    },
  )

  // One start tag with 200,000 attributes: parse5 checks each against the ones before it, so its
  // tokenizer takes minutes (80,000 took 16 s), and never comes back to the clock the tree adapter
  // reads.
  it(
    'stops a parse that would go on for minutes, at its time, and leaves this thread its own',
    ROOM,
    async () => {
      let attributes = ''
      for (let i = 0; i < 200_000; i++) attributes += ` a${String(i)}=1`
      const stuck = page(`<body><p${attributes}>x</p>`)
      let ticks = 0
      const clock = setInterval(() => ticks++, 20)
      const started = performance.now()
      let facts: Awaited<ReturnType<typeof collectPageIsolated>>
      try {
        facts = await collectPageIsolated(stuck, { timeoutMs: 1_000 })
      } finally {
        clearInterval(clock)
      }
      const took = performance.now() - started
      expect(facts).toMatchObject({ isHtml: true, html: null, text: null, htmlTooComplex: true })
      expect(took).toBeGreaterThan(900)
      expect(took).toBeLessThan(10_000)
      // Read here, the parse would have held the event loop the whole time.
      expect(ticks).toBeGreaterThan(10)
    },
  )

  it('stops when told to, and says it was stopped', ROOM, async () => {
    let attributes = ''
    for (let i = 0; i < 200_000; i++) attributes += ` a${String(i)}=1`
    const stop = new AbortController()
    const reading = collectPageIsolated(page(`<body><p${attributes}>x</p>`), {
      timeoutMs: 60_000,
      signal: stop.signal,
    })
    setTimeout(() => {
      stop.abort(new Error('The scan was stopped'))
    }, 200)
    await expect(reading).rejects.toThrow('The scan was stopped')
    await expect(
      collectPageIsolated(page('<p>x</p>'), { timeoutMs: 30_000, signal: AbortSignal.abort() }),
    ).rejects.toThrow()
  })

  it('keeps a heap of its own by default, well under the scanner container’s', () => {
    // compose.yaml gives the scanner 1200 MB, its browsers and its process among them.
    expect(ISOLATED_HEAP_MB).toBeGreaterThan(0)
    expect(ISOLATED_HEAP_MB).toBeLessThan(600)
  })
})
