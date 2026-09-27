/// <reference lib="dom" />
import { gzipSync } from 'node:zlib'
import {
  decodeStylesheet,
  fontCoverage,
  readStylesheet,
  webFontCoverage,
  type CodePointRange,
  type FontFaceFact,
  type FontFaceRule,
  type PhysicalCssFact,
  type PhysicalDeclaration,
  type CompressionFact,
  type StylesheetsFact,
  type UncompressedTextFact,
  type WebFontCoverageFact,
} from '@arablyzer/collectors'
import { redactUrl } from '@arablyzer/egress'
import type { Page, Request, Response } from 'playwright-core'
import { z } from 'zod'
import { DECODED_SIZES_NAME, fromPage, inPage, MAX_RESULT_LENGTH, throughGuard } from './guard'
import type { ImageFile } from './validate'

export interface FileLimits {
  readonly maxFonts: number
  readonly maxFontBytes: number
  readonly maxStylesheets: number
  readonly maxStylesheetBytes: number
  /** Bytes of stylesheet files read, in all. */
  readonly maxStylesheetTotal: number
  /** Characters of the page's <style> elements read, in all. */
  readonly maxInlineCss: number
  readonly maxPhysicalSources: number
  /** Text responses sent without Content-Encoding, read to gzip them: each, and in all. */
  readonly maxTextBytes: number
  readonly maxTextTotal: number
  readonly maxUncompressed: number
}

/** docs/design/plans/m1.2c-css-fonts.md §2. */
export const FILE_LIMITS: FileLimits = {
  maxFonts: 20,
  maxFontBytes: 5 * 1024 * 1024,
  maxStylesheets: 30,
  maxStylesheetBytes: 2 * 1024 * 1024,
  maxStylesheetTotal: 10 * 1024 * 1024,
  maxInlineCss: 1_000_000,
  maxPhysicalSources: 40,
  maxTextBytes: 5 * 1024 * 1024,
  maxTextTotal: 10 * 1024 * 1024,
  maxUncompressed: 50,
}

/** The main frame's responses the rules read, as they arrived during the render. */
export interface PageFiles {
  readonly stylesheets: readonly Response[]
  readonly fonts: readonly Response[]
  /** The document, scripts, and data (XHR, fetch, event streams). */
  readonly texts: readonly Response[]
  readonly images: readonly Response[]
  /**
   * Requests whose response had fully arrived: one still arriving (a font that never ends) is
   * not waited for, and counts as unread.
   */
  readonly finished: ReadonlySet<Request>
  /** How many responses came for each URL, in every frame and of every kind. */
  readonly responses: ReadonlyMap<string, number>
}

export interface FilesFacts {
  readonly arabicFontCoverage: readonly WebFontCoverageFact[]
  readonly stylesheets: StylesheetsFact
  readonly compression: CompressionFact
  readonly imageFiles: ReadonlyMap<string, ImageFile>
}

const MAX_URL = 2048
const DecodedSizes = z.array(z.tuple([z.string().max(100_000), z.number().min(0)])).max(1000)

/** A URL's decoded size in Resource Timing, and how many entries it has there. */
interface TimedSize {
  readonly size: number
  readonly entries: number
}
const InlineStyles = z.strictObject({
  base: z.string().max(MAX_URL),
  texts: z.array(z.string().max(MAX_RESULT_LENGTH)).max(100),
})

/**
 * Reads the stylesheets and font files the page loaded, once it has rendered: each web font
 * family's Arabic coverage, and the declarations that set sides by left or right. The browser
 * hands over bodies decoded, whatever their size, so a body is read only when its size is known
 * beforehand and within the limits: from what came over the network when it was not compressed,
 * else from Resource Timing (DECODED_SIZES). What cannot be read so, or is not read by `until`
 * (a performance.now() time), counts as unread.
 */
export async function readPageFiles(
  page: Page,
  files: PageFiles,
  faces: readonly FontFaceFact[],
  until: number,
  limits: FileLimits = FILE_LIMITS,
): Promise<FilesFacts> {
  const sizes = await decodedSizes(page, until)
  const bodyOf = (response: Response, max: number) => readBody(response, sizes, files, max, until)

  // Text responses: sent compressed, or read and gzipped as Lighthouse 12 did (M1.3 plan §0).
  let checked = 0
  let textTotal = 0
  const uncompressed: UncompressedTextFact[] = []
  const noteText = async (response: Response, type: string, read?: Uint8Array | null) => {
    if (!response.ok() || !files.finished.has(response.request())) return
    const encoding = await contentEncoding(response)
    if (encoding !== '' && encoding !== 'identity') {
      checked++
      return
    }
    // A body the stylesheet step could not read is tried again within the text limits.
    let body = read ?? null
    if (body === null && uncompressed.length < limits.maxUncompressed) {
      const room = Math.min(limits.maxTextBytes, limits.maxTextTotal - textTotal)
      body = room > 0 ? await bodyOf(response, room) : null
      textTotal += body?.byteLength ?? 0
    }
    if (body === null) return
    checked++
    if (uncompressed.length >= limits.maxUncompressed) return
    uncompressed.push({
      url: redactUrl(response.url()).slice(0, MAX_URL),
      type,
      size: body.byteLength,
      gzipSize: gzipSync(body).byteLength,
    })
  }
  for (const response of files.texts) {
    await noteText(response, response.request().resourceType())
  }

  const fontFiles = new Map<string, readonly CodePointRange[] | null>()
  let fonts = 0
  for (const response of files.fonts) {
    if (!response.ok()) continue
    let coverage: readonly CodePointRange[] | null = null
    if (fonts < limits.maxFonts && files.finished.has(response.request())) {
      fonts++
      const body = await bodyOf(response, limits.maxFontBytes)
      coverage = body === null ? null : fontCoverage(body)
    }
    for (const url of urlsOf(response)) fontFiles.set(url, coverage)
  }

  const rules: FontFaceRule[] = []
  const physical: PhysicalCssFact[] = []
  let read = 0
  let unread = 0
  let total = 0
  for (const response of files.stylesheets) {
    if (!response.ok()) continue
    const room = Math.min(limits.maxStylesheetBytes, limits.maxStylesheetTotal - total)
    const body =
      read < limits.maxStylesheets && room > 0 && files.finished.has(response.request())
        ? await bodyOf(response, room)
        : null
    await noteText(response, 'stylesheet', body)
    if (body === null) {
      unread++
      continue
    }
    read++
    total += body.byteLength
    const type = await response.headerValue('content-type').catch(() => null)
    const facts = readStylesheet(decodeStylesheet(body, type), response.url())
    rules.push(...facts.fontFaces)
    if (facts.physicalCount > 0 && physical.length < limits.maxPhysicalSources) {
      physical.push({
        url: redactUrl(response.url()).slice(0, MAX_URL),
        inline: false,
        count: facts.physicalCount,
        examples: facts.physical,
      })
    }
  }

  const inline = await inlineStyles(page, until, limits.maxInlineCss)
  if (inline.texts.length > 0) {
    read++
    let count = 0
    const examples: PhysicalDeclaration[] = []
    for (const text of inline.texts) {
      const facts = readStylesheet(text, inline.base)
      rules.push(...facts.fontFaces)
      count += facts.physicalCount
      examples.push(...facts.physical.slice(0, Math.max(0, 3 - examples.length)))
    }
    if (count > 0 && physical.length < limits.maxPhysicalSources) {
      physical.push({ url: redactUrl(page.url()).slice(0, MAX_URL), inline: true, count, examples })
    }
  }

  // Image files: their media type and size, which needs no body.
  const imageFiles = new Map<string, ImageFile>()
  for (const response of files.images) {
    if (!response.ok() || !files.finished.has(response.request())) continue
    const header = await response.headerValue('content-type').catch(() => null)
    const essence = header?.split(';')[0]?.trim().toLowerCase() ?? ''
    const type = essence === '' ? null : essence
    const size = await knownSize(response, sizes, files, until).catch(() => null)
    for (const url of urlsOf(response)) imageFiles.set(url, { type, size })
  }

  return {
    arabicFontCoverage: webFontCoverage(faces, rules, fontFiles),
    stylesheets: { read, unread, physical },
    compression: { checked, uncompressed },
    imageFiles,
  }
}

/** The response's Content-Encoding, trimmed and lowercased; '' without one. */
async function contentEncoding(response: Response): Promise<string> {
  const value = await response.headerValue('content-encoding').catch(() => null)
  return (value ?? '').trim().toLowerCase()
}

/** Each resource's decoded size and number of entries; none on failure. */
async function decodedSizes(page: Page, until: number): Promise<Map<string, TimedSize>> {
  const sizes = new Map<string, TimedSize>()
  try {
    const handed = await within(
      page.evaluate(throughGuard(`window.${DECODED_SIZES_NAME}()`)),
      until - performance.now(),
    )
    const parsed = DecodedSizes.safeParse(handed === undefined ? null : fromPage(handed))
    if (parsed.success) {
      for (const [url, size] of parsed.data) {
        const seen = sizes.get(url)
        sizes.set(url, { size: Math.max(seen?.size ?? 0, size), entries: (seen?.entries ?? 0) + 1 })
      }
    }
  } catch {
    // Unknown sizes: no compressed body is read.
  }
  return sizes
}

/** A response's body, when its size is known beforehand and at most `max` bytes. */
async function readBody(
  response: Response,
  sizes: ReadonlyMap<string, TimedSize>,
  files: PageFiles,
  max: number,
  until: number,
): Promise<Uint8Array | null> {
  try {
    const size = await knownSize(response, sizes, files, until)
    if (size === null || size > max) return null
    const body = await within(
      response.body().catch(() => undefined),
      until - performance.now(),
    )
    if (body === undefined || body.byteLength > max) return null
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
  } catch {
    return null
  }
}

/**
 * The size of a response's body once decoded. With Content-Encoding, only Resource Timing's
 * decoded size tells it, which is 0 for a cross-origin file without Timing-Allow-Origin. Without,
 * Content-Length when sent, else Resource Timing's size, else the bytes that came. Null when not
 * known.
 *
 * Resource Timing names a size by URL, not by response. So it counts only for a URL loaded once,
 * with one entry: a page that loads a URL twice, and makes Resource Timing drop the second entry
 * (with a buffer of one) or clear the first, could pair a small size with a large body.
 */
async function knownSize(
  response: Response,
  sizes: ReadonlyMap<string, TimedSize>,
  files: PageFiles,
  until: number,
): Promise<number | null> {
  const timed = timedSize(response, sizes, files)
  const encoding = await contentEncoding(response)
  if (encoding !== '' && encoding !== 'identity') return timed
  // Without encoding, the browser reads no more than Content-Length, which is then the size.
  const length = Number(await response.headerValue('content-length').catch(() => null))
  if (Number.isSafeInteger(length) && length > 0) return length
  if (timed !== null) return timed
  // What came over the network, which counts chunk framing too: never fewer than the body.
  const received = await within(
    response
      .request()
      .sizes()
      .catch(() => undefined),
    until - performance.now(),
  )
  const size = received?.responseBodySize ?? 0
  return size > 0 ? size : null
}

/** Resource Timing's decoded size for the response, when its URLs came back once each. */
function timedSize(
  response: Response,
  sizes: ReadonlyMap<string, TimedSize>,
  files: PageFiles,
): number | null {
  const urls = urlsOf(response)
  if (urls.some((url) => files.responses.get(url) !== 1)) return null
  const timed = urls.flatMap((url) => sizes.get(url) ?? [])
  const [only] = timed
  return timed.length === 1 && only?.entries === 1 && only.size > 0 ? only.size : null
}

/** The response's URL and those of the requests that redirected to it: CSS names the first. */
function urlsOf(response: Response): string[] {
  const urls = new Set([response.url()])
  for (let request = response.request(); ;) {
    urls.add(request.url())
    const previous = request.redirectedFrom()
    if (previous === null) break
    request = previous
  }
  return [...urls]
}

/** The page's <style> elements' text, within `max` characters in all; none on failure. */
async function inlineStyles(
  page: Page,
  until: number,
  max: number,
): Promise<{ base: string; texts: string[] }> {
  try {
    const handed = await within(
      page.evaluate(throughGuard(inPage(styleTexts, max))),
      until - performance.now(),
    )
    const parsed = InlineStyles.safeParse(handed === undefined ? null : fromPage(handed))
    if (!parsed.success) return { base: page.url(), texts: [] }
    let left = max
    const texts: string[] = []
    for (const text of parsed.data.texts) {
      if (left <= 0) break
      texts.push(text.slice(0, left))
      left -= text.length
    }
    let base = page.url()
    try {
      base = new URL(parsed.data.base).href
    } catch {
      // The page's own URL, then.
    }
    return { base, texts }
  } catch {
    return { base: page.url(), texts: [] }
  }
}

/**
 * In the page: the text of its <style> elements. CSS-in-JS libraries add their rules with
 * insertRule and leave the element empty, so an empty element gives its rules' text instead.
 */
function styleTexts(max: number): { base: string; texts: string[] } {
  const texts: string[] = []
  let total = 0
  for (const style of Array.from(document.querySelectorAll('style'))) {
    if (texts.length >= 100 || total >= max) break
    let text = style.textContent
    if (text.trim() === '') {
      try {
        const rules = style.sheet?.cssRules
        const parts: string[] = []
        for (let i = 0; rules !== undefined && i < rules.length && i < 10_000; i++) {
          parts.push(rules[i]?.cssText ?? '')
        }
        text = parts.join('\n')
      } catch {
        // A sheet whose rules cannot be read gives nothing.
      }
    }
    text = text.slice(0, max - total)
    total += text.length
    if (text !== '') texts.push(text)
  }
  return { base: document.baseURI, texts }
}

/**
 * The promise's value, or undefined when it takes longer than `ms`. A promise left behind may
 * reject later, when the browser closes; that rejection is handled here.
 */
async function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  promise.catch(() => undefined)
  if (ms <= 0) return undefined
  let timer: NodeJS.Timeout | undefined
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      resolve(undefined)
    }, ms)
    timer.unref()
  })
  try {
    return await Promise.race([promise, late])
  } finally {
    clearTimeout(timer)
  }
}
