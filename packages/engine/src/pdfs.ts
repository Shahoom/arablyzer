import { Worker } from 'node:worker_threads'
import {
  organizationalDomain,
  type PdfFacts,
  type PdfFile,
  type PageFacts,
} from '@arablyzer/collectors'
import { judgePdf } from './pdf-judge'
import type { PdfExtract } from './pdf-read'
import { type Ask } from './outside-http'

/** PDFs fetched at most, the size of each at most, and the time (docs/design/plans/arabic-native.md §10). */
export const MAX_PDFS = 3
export const MAX_PDF_BYTES = 15 * 1024 * 1024
const FETCH_TIMEOUT_MS = 30_000
/** The thread that reads one PDF gets this long and this heap. */
export const PDF_READ_MS = 30_000
export const PDF_HEAP_MB = 384
/** All the PDFs together. */
export const PDFS_TOTAL_MS = 100_000

export interface PdfLink {
  readonly url: string
}

/** The PDFs a page links (an address that ends in .pdf), the page's own domain first. */
export function pdfLinks(page: PageFacts): PdfLink[] {
  const seen = new Map<string, PdfLink>()
  const own = organizationalDomain(new URL(page.url).hostname)
  for (const anchor of page.html?.anchors ?? []) {
    if (anchor.url === null) continue
    let url: URL
    try {
      url = new URL(anchor.url)
    } catch {
      continue
    }
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !/\.pdf$/i.test(url.pathname)) {
      continue
    }
    url.hash = ''
    if (!seen.has(url.href)) seen.set(url.href, { url: url.href })
  }
  return [...seen.values()].sort(
    (a, b) =>
      Number(organizationalDomain(new URL(a.url).hostname) !== own) -
      Number(organizationalDomain(new URL(b.url).hostname) !== own),
  )
}

/** Reads the PDF in a thread with a heap of its own, ended at its time. Null when it does not finish. */
export function readInThread(
  data: Uint8Array,
  options: { readonly timeoutMs?: number; readonly heapMb?: number } = {},
): Promise<PdfExtract | null> {
  return new Promise((resolve) => {
    const thread = new Worker(new URL('./pdf-thread.mjs', import.meta.url), {
      workerData: { data },
      resourceLimits: { maxOldGenerationSizeMb: options.heapMb ?? PDF_HEAP_MB },
      execArgv: [],
    })
    let over = false
    const end = (value: PdfExtract | null) => {
      if (over) return
      over = true
      clearTimeout(timer)
      void thread.terminate()
      resolve(value)
    }
    const timer = setTimeout(() => {
      end(null)
    }, options.timeoutMs ?? PDF_READ_MS)
    thread.once('message', (extract: PdfExtract) => {
      end(extract)
    })
    thread.on('error', () => {
      end(null)
    })
    thread.once('exit', () => {
      end(null)
    })
  })
}

export interface PdfContext {
  readonly ask: Ask
  /** Whether the PDF's site lets the bot fetch it (robots.txt of its own host). */
  readonly allowed: (url: string) => Promise<boolean>
  readonly signal?: AbortSignal
  /** The page is in Arabic, so a PDF it links is taken to be meant for Arabic readers. */
  readonly arabicPage: boolean
  /** Reads a PDF's text; the thread, unless a test gives another. */
  readonly read?: (data: Uint8Array) => Promise<PdfExtract | null>
}

const MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] // %PDF-

async function examine(link: PdfLink, context: PdfContext): Promise<PdfFile> {
  const empty = (outcome: PdfFile['outcome'], bytes = 0): PdfFile => ({
    url: link.url,
    outcome,
    bytes,
    pages: 0,
    pagesRead: 0,
    title: null,
    language: null,
    issues: [],
  })
  if (!(await context.allowed(link.url))) return empty('robots')
  const response = await context.ask({
    url: link.url,
    accept: 'application/pdf',
    // One more than the limit, truncated: a file that fills it is over it.
    maxBytes: MAX_PDF_BYTES + 1,
    truncate: true,
    timeoutMs: FETCH_TIMEOUT_MS,
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  })
  if (response?.status !== 200) return empty('failed')
  if (response.body.length > MAX_PDF_BYTES) return empty('too-large', response.body.length)
  // The first kilobyte may hold a banner before the header, as pdf.js allows.
  const head = response.body.subarray(0, 1024)
  if (!head.some((_, index) => MAGIC.every((byte, at) => head[index + at] === byte))) {
    return empty('not-pdf', response.body.length)
  }
  const extract = await (context.read ?? readInThread)(response.body)
  if (extract === null) return empty('unreadable', response.body.length)
  if (extract.status !== 'read') {
    return empty(extract.status === 'encrypted' ? 'encrypted' : 'unreadable', response.body.length)
  }
  const arabicHint = context.arabicPage || /^ar\b/i.test(extract.language ?? '')
  return {
    url: link.url,
    outcome: 'read',
    bytes: response.body.length,
    pages: extract.pages,
    pagesRead: extract.texts.length,
    title: extract.title,
    language: extract.language,
    issues: judgePdf({
      pages: extract.texts,
      title: extract.title,
      language: extract.language,
      arabicHint,
    }),
  }
}

/** Up to MAX_PDFS of the page's PDF links, fetched one at a time and read; the rest only counted. */
export async function checkPdfs(page: PageFacts, context: PdfContext): Promise<PdfFacts> {
  const links = pdfLinks(page)
  const files: PdfFile[] = []
  for (const link of links.slice(0, MAX_PDFS)) {
    if (context.signal?.aborted === true) break
    files.push(await examine(link, context))
  }
  return { outcome: 'checked', linked: links.length, files }
}
