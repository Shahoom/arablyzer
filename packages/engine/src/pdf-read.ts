import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

/**
 * Reads a PDF's text and metadata with pdf.js (docs/design/plans/arabic-native.md §10). Runs in
 * a thread of its own (pdfs.ts): a hostile PDF can outgrow its heap or its time and costs only
 * that thread. No script runs, no font is loaded or drawn, and only the
 * first pages are read.
 */

/** Pages read at most, and the text kept of each. */
export const MAX_PAGES = 20
const MAX_PAGE_CHARS = 200_000

export interface PdfExtract {
  readonly status: 'read' | 'encrypted' | 'unreadable'
  readonly pages: number
  readonly texts: readonly string[]
  readonly title: string | null
  readonly language: string | null
}

const LANG = /\/Lang\s*\(\s*([A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*)\s*\)/

/** The /Lang of the catalog, when it is in the file's plain text (not in a compressed object stream). */
function languageIn(data: Uint8Array): string | null {
  const head = Buffer.from(data.subarray(0, Math.min(data.length, 4 * 1024 * 1024))).toString(
    'latin1',
  )
  const tail =
    data.length > 4 * 1024 * 1024
      ? Buffer.from(data.subarray(data.length - 1024 * 1024)).toString('latin1')
      : ''
  return LANG.exec(head)?.[1] ?? LANG.exec(tail)?.[1] ?? null
}

const blank = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, 200) : null

export async function readPdf(data: Uint8Array): Promise<PdfExtract> {
  const language = languageIn(data)
  // pdf.js takes ownership of the buffer it is given; it gets a copy.
  const task = getDocument({
    data: new Uint8Array(data),
    disableFontFace: true,
    useSystemFonts: false,
    enableXfa: false,
    disableAutoFetch: true,
    disableStream: true,
    stopAtErrors: false,
    verbosity: 0,
  })
  try {
    const doc = await task.promise
    const meta = await doc.getMetadata().catch(() => null)
    const info = (meta?.info ?? {}) as Record<string, unknown>
    const xmp = meta?.metadata
    const texts: string[] = []
    for (let number = 1; number <= Math.min(doc.numPages, MAX_PAGES); number++) {
      const page = await doc.getPage(number)
      const content = await page.getTextContent()
      let text = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        text += item.str
        text += item.hasEOL ? '\n' : ' '
        if (text.length > MAX_PAGE_CHARS) break
      }
      texts.push(text.slice(0, MAX_PAGE_CHARS))
      page.cleanup()
    }
    return {
      status: 'read',
      pages: doc.numPages,
      texts,
      title: blank(info.Title) ?? blank(xmp?.get('dc:title')),
      language: language ?? blank(info.Language) ?? blank(xmp?.get('dc:language')),
    }
  } catch (error) {
    const name = (error as { name?: string } | null)?.name
    return {
      status: name === 'PasswordException' ? 'encrypted' : 'unreadable',
      pages: 0,
      texts: [],
      title: null,
      language: null,
    }
  } finally {
    await task.destroy().catch(() => undefined)
  }
}
