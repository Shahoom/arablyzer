import { collectPage, type PageFacts } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { judgePdf } from '../src/pdf-judge'
import { readPdf } from '../src/pdf-read'
import { MAX_PDF_BYTES, checkPdfs, pdfLinks, readInThread } from '../src/pdfs'
import type { Ask, AskRequest } from '../src/outside-http'

/** A one-page PDF, written by hand: pdf.js rebuilds the cross-reference table it lacks. */
function pdf(options: { title?: string; lang?: string; text?: string } = {}): Uint8Array {
  const content = options.text === undefined ? '' : `BT /F1 12 Tf 20 100 Td (${options.text}) Tj ET`
  const lang = options.lang === undefined ? '' : ` /Lang (${options.lang})`
  const body = [
    '%PDF-1.4',
    `1 0 obj << /Type /Catalog /Pages 2 0 R${lang} >> endobj`,
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${String(content.length)} >> stream\n${content}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    options.title === undefined
      ? '6 0 obj << >> endobj'
      : `6 0 obj << /Title (${options.title}) >> endobj`,
    'trailer << /Root 1 0 R /Info 6 0 R /Size 7 >>',
    '%%EOF',
  ].join('\n')
  return new TextEncoder().encode(body)
}

const page = (html: string): PageFacts =>
  collectPage({
    url: 'https://www.alwaha.com.sa/reports/',
    status: 200,
    headers: [['content-type', 'text/html; charset=utf-8']],
    body: new TextEncoder().encode(`<!doctype html><html lang="ar"><body>${html}</body></html>`),
    certificate: null,
  })

describe('reading a PDF with pdf.js', () => {
  it('reads the text, the title and the language', async () => {
    const extract = await readPdf(pdf({ title: 'Annual report', lang: 'ar-SA', text: 'Hello PDF' }))
    expect(extract).toMatchObject({
      status: 'read',
      pages: 1,
      title: 'Annual report',
      language: 'ar-SA',
    })
    expect(extract.texts[0]).toContain('Hello PDF')
  })

  it('reads a PDF with neither, and a page with no text', async () => {
    const extract = await readPdf(pdf())
    expect(extract).toMatchObject({ status: 'read', title: null, language: null })
    expect(extract.texts.map((text) => text.trim())).toEqual([''])
  })

  it('does not read what is not a PDF', async () => {
    expect((await readPdf(new TextEncoder().encode('not a pdf at all'))).status).toBe('unreadable')
  })

  it('reads in a thread of its own, and gives up on one that takes too long', async () => {
    const extract = await readInThread(pdf({ title: 'T', text: 'Hi' }))
    expect(extract?.title).toBe('T')
    expect(await readInThread(pdf({ text: 'Hi' }), { timeoutMs: 1 })).toBeNull()
  })
})

describe('what is wrong with the Arabic of a PDF', () => {
  const reversed =
    'ةيبرعلا ةكلمملا يف ةيدوعسلا ةكرشلا نم ريرقتلا اذه ىلع ةمدقملا ةطخلا نع تامولعملا'
  const normal = 'المملكة العربية السعودية الشركة في التقرير هذا على المقدمة الخطة عن المعلومات'
  const issues = (pages: string[], extra: Partial<Parameters<typeof judgePdf>[0]> = {}) =>
    judgePdf({ pages, title: 'عنوان', language: 'ar', arabicHint: true, ...extra }).map(
      (issue) => issue.kind,
    )

  it('finds letters in reversed (visual) order, and not text in order', () => {
    expect(issues([reversed])).toEqual(['reversed'])
    expect(issues([normal])).toEqual([])
  })

  it('finds presentation forms, and private-use garbage from a font with no Unicode map', () => {
    const forms = 'ﻣﺮﺣﺒﺎ ﺑﻜﻢ ﻓﻲ ﺷﺮﻛﺘﻨﺎ ﻭﻧﺤﻦ ﻧﻘﺪﻡ ﻟﻜﻢ ﺃﻓﻀﻞ ﺍﻟﺨﺪﻣﺎﺕ'
    expect(issues([forms])).toContain('presentation-forms')
    const garbage = `${String.fromCharCode(...Array.from({ length: 16 }, (_, i) => 0xe001 + i))} abcdefgh`
    expect(issues([garbage])).toEqual(['no-unicode-map'])
  })

  it('reads accented Latin as a legacy Arabic font only for a page in Arabic', () => {
    const legacy = 'ÇáÚÑÈíÉ ÇáããáßÉ Ýí ÇáÓÚæÏíÉ ÇáÔÑßÉ ãä ÇáÊÞÑíÑ ÇáÓäæí ÇáãÞÏãÉ'
    expect(issues([legacy])).toContain('no-unicode-map')
    expect(issues([legacy], { arabicHint: false })).toEqual([])
  })

  it('finds pages with no text, a missing title and a missing language', () => {
    expect(issues(['', '', normal])).toEqual(['image-only'])
    expect(issues([normal], { title: null, language: null })).toEqual(['no-title', 'no-language'])
    expect(issues([normal], { title: '  ' })).toEqual(['no-title'])
  })

  it('says nothing about Arabic from a text too short to judge', () => {
    expect(issues(['ةيبرعلا'])).toEqual([])
  })
})

describe('the PDFs a page links', () => {
  const links = page(
    '<a href="/a.pdf">a</a> <a href="https://cdn.example.org/x.PDF?v=1">x</a> <a href="/b.pdf#page=2">b</a> <a href="/a.pdf">again</a> <a href="/c.pdf">c</a> <a href="/d.html">d</a>',
  )

  it('lists the distinct ones, the page’s own domain first', () => {
    expect(pdfLinks(links).map((link) => link.url)).toEqual([
      'https://www.alwaha.com.sa/a.pdf',
      'https://www.alwaha.com.sa/b.pdf',
      'https://www.alwaha.com.sa/c.pdf',
      'https://cdn.example.org/x.PDF?v=1',
    ])
  })

  it('fetches three at most, within the size, where robots.txt allows, and says why one was not read', async () => {
    const requests: AskRequest[] = []
    const files: Record<string, Uint8Array | null> = {
      'https://www.alwaha.com.sa/a.pdf': pdf({ title: 'T', lang: 'ar', text: 'Hi' }),
      'https://www.alwaha.com.sa/b.pdf': new TextEncoder().encode('<html>no</html>'),
      'https://www.alwaha.com.sa/c.pdf': new Uint8Array(MAX_PDF_BYTES + 1).fill(37),
    }
    const ask: Ask = (request) => {
      requests.push(request)
      const body = files[request.url]
      return Promise.resolve(body == null ? null : { status: 200, body })
    }
    const facts = await checkPdfs(links, {
      ask,
      arabicPage: true,
      allowed: (url) => Promise.resolve(!url.includes('cdn.example.org')),
    })
    expect(facts.linked).toBe(4)
    expect(facts.files.map((file) => [file.url.split('/').pop(), file.outcome])).toEqual([
      ['a.pdf', 'read'],
      ['b.pdf', 'not-pdf'],
      ['c.pdf', 'too-large'],
    ])
    expect(facts.files[0]).toMatchObject({ title: 'T', language: 'ar', pages: 1 })
    expect(requests).toHaveLength(3)
    expect(requests[0]).toMatchObject({
      truncate: true,
      maxBytes: MAX_PDF_BYTES + 1,
      accept: 'application/pdf',
    })
  })

  it('does not fetch a PDF robots.txt keeps the bot from, nor read one that is encrypted or fails', async () => {
    const ask: Ask = () => Promise.resolve(null)
    const facts = await checkPdfs(page('<a href="/a.pdf">a</a><a href="/b.pdf">b</a>'), {
      ask,
      arabicPage: true,
      allowed: (url) => Promise.resolve(!url.endsWith('/a.pdf')),
    })
    expect(facts.files.map((file) => file.outcome)).toEqual(['robots', 'failed'])
  })
})

describe('the PDF forensics in a tool scan', () => {
  it('reports the linked PDFs in the facts and as findings', async () => {
    const { tempSite } = await import('./helpers')
    const { createPolicy } = await import('@arablyzer/egress')
    const { scan } = await import('../src/index')
    const site = await tempSite({
      'index.html':
        '<!doctype html><html lang="ar"><head><meta charset="utf-8"></head><body><p>مرحبا بكم في موقعنا</p><a href="/files/r.pdf">r</a></body></html>',
    })
    try {
      const requests: string[] = []
      const report = await scan(site.url('/'), {
        ruleIds: ['pdf-arabic-text', 'pdf-metadata'],
        policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
        outside: {
          ask: (request) => {
            requests.push(request.url)
            return Promise.resolve({ status: 200, body: pdf({ text: 'x' }) })
          },
          test: {
            read: () =>
              Promise.resolve({
                status: 'read' as const,
                pages: 2,
                texts: ['', ''],
                title: null,
                language: null,
              }),
          },
        },
      })
      expect(requests).toEqual([site.url('/files/r.pdf')])
      expect(report.facts.pdfs).toMatchObject({ linked: 1 })
      expect(report.facts.pdfs?.files[0]?.issues.map((issue) => issue.kind)).toEqual([
        'image-only',
        'no-title',
        'no-language',
      ])
      expect(
        report.findings.map(
          (finding) =>
            `${finding.ruleId}:${finding.evidence.url?.slice(site.url('/').length) ?? ''}`,
        ),
      ).toEqual([
        'pdf-arabic-text:files/r.pdf',
        'pdf-metadata:files/r.pdf',
        'pdf-metadata:files/r.pdf',
      ])
    } finally {
      await site.close()
    }
  })
})
