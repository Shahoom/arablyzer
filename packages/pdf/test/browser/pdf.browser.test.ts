import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { renderPdf } from '@arablyzer/browser'
import type { Report } from '@arablyzer/report-schema'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { brandOf, pageDocument, renderHtml, type PdfDocument } from '../../src/index'

// The PDF as Chromium draws it (M4.7), from a golden report: Arabic that is text and not a picture,
// the site's own fonts embedded, a tagged structure and an outline, page numbers, a company's mark in
// place of Arabic's, and a page that cannot reach the network.

const GOLDEN = new URL('../../../../fixtures/golden/reports/04-rtl-layout.json', import.meta.url)
const report = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Report
const NOW = new Date('2026-10-10T10:00:00.000Z')
/** A real 1×1 JPEG and PNG, for the Arabic X-ray's picture and a logo. */
const JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
)

const withXray = (): Report => ({
  ...report,
  facts: {
    ...report.facts,
    xray: {
      percent: 94,
      engines: [
        {
          engine: 'chromium',
          total: 120,
          broken: 2,
          truncated: false,
          viewport: { width: 390, height: 844 },
          words: [{ text: 'كلمة', kind: 'glyph', box: { x: 1, y: 1, width: 10, height: 10 } }],
          image: JPEG,
        },
      ],
    },
  },
})

async function load(pdf: Uint8Array) {
  const loaded = await getDocument({ data: pdf.slice() }).promise
  const pages = await Promise.all(
    Array.from({ length: loaded.numPages }, async (_, index) => {
      const page = await loaded.getPage(index + 1)
      return (await page.getTextContent()).items.filter((item) => 'str' in item)
    }),
  )
  return { loaded, pages }
}

/** The lines of a page as pdf.js reads them: by height on the page, then left to right. */
function lines(items: readonly { str: string; transform: number[] }[]): string[] {
  const rows = new Map<number, { x: number; str: string }[]>()
  for (const item of items) {
    const y = Math.round((item.transform[5] ?? 0) / 3)
    rows.set(y, [...(rows.get(y) ?? []), { x: item.transform[4] ?? 0, str: item.str }])
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) =>
      row
        .sort((a, b) => a.x - b.x)
        .map((cell) => cell.str)
        .join(''),
    )
}

/**
 * Chromium writes right-to-left text in the order it is drawn, left to right, marked ReversedChars,
 * with the base letters in each glyph's ActualText; pdf.js reads the drawn order and the letters'
 * presentation forms. A purely Arabic line, normalised and read from its far end, is the logical text;
 * spaces are left out of the comparison, since a gap between two letters that do not join reads as one.
 */
const logical = (line: string): string =>
  Array.from(line.normalize('NFKC').replaceAll(' ', '')).reverse().join('')

const raw = (pdf: Uint8Array): string => Buffer.from(pdf).toString('latin1')

describe('the PDF of a golden report', () => {
  it('has Arabic text that can be selected, in logical order, in the site’s fonts, tagged, with an outline', async () => {
    const document = pageDocument({ report: withXray(), lang: 'ar', brand: null, generatedAt: NOW })
    const pdf = await renderPdf(renderHtml(document))
    expect(String.fromCharCode(...pdf.subarray(0, 5))).toBe('%PDF-')
    const { loaded, pages } = await load(pdf)
    expect(loaded.numPages).toBeGreaterThanOrEqual(2)

    // Text, not pictures: the cover's words are there to be read in logical order.
    const cover = lines(pages[0] as never).map(logical)
    expect(cover.some((line) => line.includes('تقريرفحصصفحة'))).toBe(true)
    expect(cover.some((line) => line.includes('الدرجةالعامة'))).toBe(true)
    const body = pages
      .slice(1)
      .flatMap((items) => lines(items as never))
      .map(logical)
    expect(body.some((line) => line.includes('الملخص'))).toBe(true)
    // A rule’s title, as the report holds it in Arabic.
    const title = report.rules.find((rule) => rule.status === 'fail')?.title.ar ?? ''
    // pdf.js orders two letters that share a position either way, so the words are compared by
    // their ends: the title's first word comes before its last, as in reading order.
    const words = title.split(' ')
    const first = words[0] ?? ''
    const last = words.at(-1) ?? ''
    expect(first.length).toBeGreaterThan(2)
    expect(
      body.some((line) => line.includes(first) && line.indexOf(first) < line.indexOf(last)),
    ).toBe(true)

    // The outline is made from the headings: one entry for each section and each finding's fix.
    // (pdf.js reads its Arabic titles back in its own word order, so they are not compared here.)
    const titles = (entries: { title: string; items: unknown[] }[]): string[] =>
      entries.flatMap((entry) => [entry.title, ...titles(entry.items as never)])
    const outline = titles(await loaded.getOutline())
    expect(outline.length).toBeGreaterThanOrEqual(8)
    expect(outline.some((title) => title.includes('الملخص'))).toBe(true)

    // The three families are in the file, as subsets, and the file is tagged.
    const text = raw(pdf)
    expect(text).toMatch(/\/FontName \/[A-Z]{6}\+IBMPlexSansArabic/)
    expect(text).toMatch(/\/FontName \/[A-Z]{6}\+IBMPlexMono/)
    expect(text).toContain('/StructTreeRoot')
    expect(text).toContain('/Outlines')
    // The X-ray's picture went in as a JPEG.
    expect(text).toContain('/DCTDecode')
  })

  it('is left to right in English, numbered, and in DM Sans', async () => {
    const document = pageDocument({ report, lang: 'en', brand: null, generatedAt: NOW })
    const pdf = await renderPdf(renderHtml(document))
    const { pages } = await load(pdf)
    const all = pages.map((items) => items.map((item) => item.str).join(' '))
    expect(all[0]).toContain('Page audit report')
    expect(all[1]).toContain('Summary')
    expect(all[1]).toMatch(/\b2\b.{0,8}\bof\b.{0,8}\b\d+\b/)
    expect(all.join(' ')).toContain(
      report.rules.find((rule) => rule.status === 'fail')?.title.en ?? '',
    )
    expect(raw(pdf)).toMatch(/\/FontName \/[A-Z]{6}\+DMSans/)
  })

  it('shows the company’s name, logo and colour in place of Arablyzer’s, with the credit line', async () => {
    const brand = brandOf(
      { name: 'Noor Co', color: '#0b3d2e', logo: { type: 'image/png', bytes: PNG }, credit: true },
      'en',
    )
    const document = pageDocument({ report, lang: 'en', brand, generatedAt: NOW })
    const pdf = await renderPdf(renderHtml(document))
    const { pages } = await load(pdf)
    const cover = pages[0]?.map((item) => item.str).join(' ') ?? ''
    expect(cover).toContain('Noor Co')
    expect(cover).toContain('by Arablyzer')
    expect(pages.map((items) => items.map((item) => item.str).join(' ')).join(' ')).not.toContain(
      'Arablyzer ·',
    )
    expect(raw(pdf)).toContain('/Subtype /Image')
    // Without the credit (a plan that removed it) the cover says nothing of Arablyzer.
    const bare = brandOf({ name: 'Noor Co', color: '#0b3d2e', logo: null, credit: false }, 'en')
    const plain = await load(
      await renderPdf(
        renderHtml(pageDocument({ report, lang: 'en', brand: bare, generatedAt: NOW })),
      ),
    )
    expect(plain.pages[0]?.map((item) => item.str).join(' ')).not.toContain('Arablyzer')
  })

  it('cannot reach the network: a page that asks for an address gets nothing', async () => {
    const hits: string[] = []
    const server = createServer((request, response) => {
      hits.push(request.url ?? '')
      response.end('x')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    try {
      const document: PdfDocument = pageDocument({
        report,
        lang: 'en',
        brand: null,
        generatedAt: NOW,
      })
      const html = renderHtml(document).replace(
        '</body>',
        `<img src="http://127.0.0.1:${String(port)}/img"><link rel="stylesheet" href="http://127.0.0.1:${String(port)}/css"><iframe src="http://127.0.0.1:${String(port)}/frame"></iframe><script>fetch('http://127.0.0.1:${String(port)}/script')</script></body>`,
      )
      const pdf = await renderPdf(html)
      expect(String.fromCharCode(...pdf.subarray(0, 5))).toBe('%PDF-')
      expect(hits).toEqual([])
    } finally {
      server.close()
    }
  })
})
