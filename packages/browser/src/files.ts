/// <reference lib="dom" />
import { gzipSync } from 'node:zlib'
import {
  decodeStylesheet,
  fontCoverage,
  intersectRanges,
  readStylesheet,
  subsetFont,
  unicodeRangeOf,
  webFontCoverage,
  type ArabicTextBlock,
  type CodePointRange,
  type FontFaceFact,
  type FontFaceRule,
  type PhysicalCssFact,
  type PhysicalDeclaration,
  type CompressionFact,
  type StylesheetsFact,
  type UncompressedTextFact,
  type WebFontCoverageFact,
  type WebFontFileFact,
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
  /** Arabic font files subset to say how much a subset would weigh, and the largest of them. */
  readonly maxSubsets: number
  readonly maxSubsetBytes: number
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
  maxSubsets: 8,
  maxSubsetBytes: 2 * 1024 * 1024,
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
  readonly webFonts: readonly WebFontFileFact[]
  readonly stylesheets: StylesheetsFact
  readonly compression: CompressionFact
  readonly imageFiles: ReadonlyMap<string, ImageFile>
}

const MAX_URL = 2048
const DecodedSizes = z.array(z.tuple([z.string().max(100_000), z.number().min(0)])).max(1000)

/** A URL's decoded size in Resource Timing, and how many entries it has there. */
export interface TimedSize {
  readonly size: number
  readonly entries: number
}
const InlineStyles = z.strictObject({
  base: z.string().max(MAX_URL),
  texts: z.array(z.string().max(MAX_RESULT_LENGTH)).max(100),
})

/**
 * Reads the stylesheets and font files the page loaded, once it has rendered: each web font
 * family's Arabic coverage, and the declarations that set sides by left or right; the text sent
 * uncompressed; and each image file's type and size. The browser hands over bodies decoded,
 * whatever their size, so a body is read only when a bound on its size is known beforehand and is
 * within the limits (sizeBound). What cannot be read so, or is not read by `until` (a
 * performance.now() time), counts as unread.
 */
export async function readPageFiles(
  page: Page,
  files: PageFiles,
  faces: readonly FontFaceFact[],
  until: number,
  limits: FileLimits = FILE_LIMITS,
  /** The Arabic text measured, which says what each font family shows. */
  shown: readonly Pick<ArabicTextBlock, 'primaryFamily' | 'text' | 'arabicCharacters'>[] = [],
): Promise<FilesFacts> {
  const sizes = await decodedSizes(page, until)
  const bodyOf = (response: Response, max: number) => readBody(response, sizes, files, max, until)

  // Text responses: sent compressed, or read and gzipped as Lighthouse 12 did (M1.3 plan §0).
  let checked = 0
  let textTotal = 0
  const uncompressed: UncompressedTextFact[] = []
  const noteText = async (response: Response, type: string, read?: Body | null) => {
    // A part of a file (206) is not the file.
    if (!response.ok() || response.status() === 206) return
    if (!files.finished.has(response.request())) return
    const mimeType = await mediaType(response)
    // Media a script fetched is not text: Lighthouse 12 left image, audio and video out too.
    if (mimeType !== null && /^(?:image|audio|video)\//.test(mimeType)) return
    if (await isCompressed(response)) {
      checked++
      return
    }
    // A body the stylesheet step could not read is tried again within the text limits.
    let body = read ?? null
    if (body === null) {
      const room = Math.min(limits.maxTextBytes, limits.maxTextTotal - textTotal)
      body = room > 0 ? await bodyOf(response, room) : null
      textTotal += body?.bytes.byteLength ?? 0
    }
    // Text the engine handed re-encoded is not what was sent, so its gzipped size says nothing.
    if (body?.asSent !== true) return
    checked++
    uncompressed.push({
      url: redactUrl(response.url()).slice(0, MAX_URL),
      type,
      mimeType,
      size: body.bytes.byteLength,
      gzipSize: gzipSync(body.bytes).byteLength,
    })
  }
  for (const response of files.texts) {
    await noteText(response, response.request().resourceType())
  }

  const fontFiles = new Map<string, readonly CodePointRange[] | null>()
  // The Arabic fonts that are small enough to subset, kept until their rules say their family.
  const arabicFonts: { urls: string[]; url: string; bytes: Uint8Array }[] = []
  let fonts = 0
  for (const response of files.fonts) {
    if (!response.ok()) continue
    let coverage: readonly CodePointRange[] | null = null
    if (fonts < limits.maxFonts && files.finished.has(response.request())) {
      fonts++
      const body = await bodyOf(response, limits.maxFontBytes)
      coverage = body === null ? null : fontCoverage(body.bytes)
      if (
        body !== null &&
        coverage !== null &&
        arabicFonts.length < limits.maxSubsets &&
        body.bytes.byteLength <= limits.maxSubsetBytes &&
        intersectRanges(coverage, ARABIC_LETTERS).length > 0
      ) {
        arabicFonts.push({
          urls: urlsOf(response),
          url: redactUrl(response.url()).slice(0, MAX_URL),
          bytes: body.bytes,
        })
      }
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
    total += body.bytes.byteLength
    // Re-encoded by the engine, the text is UTF-8 whatever the stylesheet declared.
    const type = body.asSent ? await response.headerValue('content-type').catch(() => null) : null
    const text = body.asSent
      ? decodeStylesheet(body.bytes, type)
      : new TextDecoder('utf-8').decode(body.bytes)
    const facts = readStylesheet(text, response.url())
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
    const type = await mediaType(response)
    const size = await sizeBound(response, sizes, files, until).catch(() => null)
    for (const url of urlsOf(response)) imageFiles.set(url, { type, size })
  }

  return {
    arabicFontCoverage: webFontCoverage(faces, rules, fontFiles),
    webFonts: await subsetEstimates(arabicFonts, rules, shown, until),
    stylesheets: { read, unread, physical },
    // Those that would gain most, whatever order they came in: many small files cannot crowd
    // out a large one.
    compression: { checked, uncompressed: mostGained(uncompressed, limits.maxUncompressed) },
    imageFiles,
  }
}

/** The Arabic letters proper: a font that has none of them does not draw Arabic. */
const ARABIC_LETTERS: readonly CodePointRange[] = [[0x0621, 0x064a]]

const MAX_USED_CHARACTERS = 400

/** The format a font file is, by its first bytes. */
export function fontFormat(bytes: Uint8Array): WebFontFileFact['format'] {
  const tag = String.fromCharCode(...bytes.subarray(0, 4))
  if (tag === 'wOF2') return 'woff2'
  if (tag === 'wOFF') return 'woff'
  if (tag === 'OTTO') return 'otf'
  if (tag === '\u0000\u0001\u0000\u0000' || tag === 'true') return 'ttf'
  return 'unknown'
}

/**
 * What a WOFF2 subset of each Arabic font file would weigh for the Arabic text the page shows in
 * its family (docs/design/plans/arabic-native.md §1). The family comes from the @font-face rule
 * that loads the file; the characters, from the measured Arabic blocks set in that family. A
 * family none of the measured text uses, or a file the subsetter cannot read, has no subset size.
 */
async function subsetEstimates(
  fonts: readonly { urls: string[]; url: string; bytes: Uint8Array }[],
  rules: readonly FontFaceRule[],
  shown: readonly Pick<ArabicTextBlock, 'primaryFamily' | 'text' | 'arabicCharacters'>[],
  until: number,
): Promise<WebFontFileFact[]> {
  const facts: WebFontFileFact[] = []
  for (const font of fonts) {
    const rule = rules.find((candidate) =>
      candidate.sources.some((source) => source.kind === 'url' && font.urls.includes(source.url)),
    )
    if (rule === undefined) continue
    const family = rule.family.toLowerCase()
    const characters = new Set<string>()
    for (const block of shown) {
      if (block.primaryFamily.toLowerCase() !== family) continue
      for (const char of block.arabicCharacters + block.text) characters.add(char)
    }
    const usedCharacters = [...characters].join('').slice(0, MAX_USED_CHARACTERS)
    let subsetBytes: number | null = null
    let unicodeRange: string | null = null
    if (usedCharacters !== '' && performance.now() < until) {
      try {
        const subset = await subsetFont(font.bytes, usedCharacters)
        subsetBytes = subset.woff2.byteLength
        unicodeRange = unicodeRangeOf(subset.ranges)
      } catch {
        // A file the subsetter cannot read has no subset: the rule leaves it out.
      }
    }
    facts.push({
      family: rule.family,
      url: font.url,
      format: fontFormat(font.bytes),
      bytes: font.bytes.byteLength,
      weight: rule.weight ?? null,
      style: rule.style ?? null,
      usedCharacters,
      subsetBytes,
      unicodeRange,
    })
  }
  return facts
}

/** Content codings the browsers decode (Chromium, Firefox and WebKit). */
const COMPRESSIONS = new Set(['gzip', 'x-gzip', 'deflate', 'br', 'zstd'])

/** Whether the response came in a content coding the browser decodes. */
async function isCompressed(response: Response): Promise<boolean> {
  const value = await response.headerValue('content-encoding').catch(() => null)
  return (value ?? '').split(',').some((coding) => COMPRESSIONS.has(coding.trim().toLowerCase()))
}

/** The response's media type without parameters, lowercased; null without one. */
async function mediaType(response: Response): Promise<string | null> {
  const header = await response.headerValue('content-type').catch(() => null)
  const essence = header?.split(';')[0]?.trim().toLowerCase() ?? ''
  return essence === '' ? null : essence
}

/** The first `max` texts by bytes gzip saves, ties by URL, so the same page gives the same list. */
function mostGained(texts: UncompressedTextFact[], max: number): UncompressedTextFact[] {
  const gained = (text: UncompressedTextFact) => text.size - text.gzipSize
  return texts
    .sort((a, b) => gained(b) - gained(a) || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
    .slice(0, max)
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

/** A body as the browser handed it. */
export interface Body {
  readonly bytes: Uint8Array
  /**
   * Whether these are the bytes that were sent. Chromium and WebKit hand a text response decoded
   * and re-encoded as UTF-8, so one in a legacy encoding such as windows-1256 comes back longer
   * than it was sent, and its bytes are then UTF-8; Firefox hands the bytes sent (measured
   * 2026-09-27). A re-encoded body that stays within the bound, by chunk framing, goes unseen.
   */
  readonly asSent: boolean
}

/**
 * A response's body, when a bound on its size is known before reading it (sizeBound) and is at
 * most `max` bytes. The engine may hand text re-encoded, longer than it was sent (see Body), so
 * the body read may pass the bound; one over `max` is dropped all the same.
 */
export async function readBody(
  response: Response,
  sizes: ReadonlyMap<string, TimedSize>,
  files: Pick<PageFiles, 'responses'>,
  max: number,
  until: number,
): Promise<Body | null> {
  try {
    const bound = await sizeBound(response, sizes, files, until)
    if (bound === null || bound > max) return null
    const body = await within(
      response.body().catch(() => undefined),
      until - performance.now(),
    )
    if (body === undefined || body.byteLength > max) return null
    return {
      bytes: new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
      asSent: body.byteLength <= bound,
    }
  } catch {
    return null
  }
}

/**
 * The most bytes a response's body can have once decoded, known before reading it; null when not
 * known. In a content coding, only Resource Timing's decoded size tells it, which is 0 for a
 * cross-origin file without Timing-Allow-Origin. Without one, Resource Timing's size, else the
 * bytes that came over the network, which count chunk framing too and so are never fewer than the
 * body. Content-Length is no bound: a chunked or HTTP/2 body can be longer than it says (M1.3a
 * review; 100,004 bytes came under `Content-Length: 10` in all three engines).
 *
 * Resource Timing names a size by URL, not by response. So it counts only for a URL loaded once,
 * with one entry: a page that loads a URL twice, and makes Resource Timing drop the second entry
 * (with a buffer of one) or clear the first, could pair a small size with a large body.
 */
async function sizeBound(
  response: Response,
  sizes: ReadonlyMap<string, TimedSize>,
  files: Pick<PageFiles, 'responses'>,
  until: number,
): Promise<number | null> {
  const timed = timedSize(response, sizes, files)
  if (timed !== null || (await isCompressed(response))) return timed
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
  files: Pick<PageFiles, 'responses'>,
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
