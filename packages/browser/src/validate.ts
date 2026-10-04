import type {
  A11yFacts,
  ArabicTextBlock,
  CompressionFact,
  Engine,
  FontFaceFact,
  FontRequestFact,
  RenderedFacts,
  StylesheetsFact,
  UsedFontsFact,
  WebFontCoverageFact,
  WebFontFileFact,
} from '@arablyzer/collectors'
import { redactUrl } from '@arablyzer/egress'
import { z } from 'zod'
import { MEASURE_LIMITS } from './measure'

/** Lengths the page script already keeps to; anything longer came from a page that meddled. */
const pixels = z.number().int().min(-10_000_000).max(10_000_000)
const size = z.number().int().min(0).max(10_000_000)
const Box = z.strictObject({ x: pixels, y: pixels, width: size, height: size })
const selector = z.string().max(300)

const FontFace = z.strictObject({
  family: z.string().max(200),
  status: z.enum(['unloaded', 'loading', 'loaded', 'error']),
  weight: z.string().max(50),
  style: z.string().max(50),
  unicodeRange: z.string().max(2000),
})

const Measured = z.strictObject({
  dir: z.enum(['ltr', 'rtl']),
  lang: z.string().max(100).nullable(),
  viewportMeta: z.string().max(500).nullable(),
  viewport: z.strictObject({ width: size, height: size }),
  scrollWidth: size,
  overflow: z.array(z.strictObject({ selector, box: Box })).max(MEASURE_LIMITS.maxOverflow),
  arabicText: z
    .array(
      z.strictObject({
        selector,
        box: Box,
        text: z.string().max(MEASURE_LIMITS.textLength),
        letterSpacing: z.number().min(-10_000).max(10_000),
        letterSpacingApplied: z.boolean().nullable(),
        fontFamily: z.string().max(500),
        primaryFamily: z.string().max(200),
        arabicCharacters: z.string().max(MEASURE_LIMITS.maxCharacters),
      }),
    )
    .max(MEASURE_LIMITS.maxBlocks),
  arabicTextOmitted: z.number().int().min(0),
  fontFaces: z.array(FontFace).max(MEASURE_LIMITS.maxFontFaces),
  fontFacesOmitted: z.number().int().min(0),
  bidi: z
    .array(
      z.strictObject({
        selector,
        box: Box,
        text: z.string().max(40),
        kind: z.enum(['number', 'latin']),
      }),
    )
    .max(MEASURE_LIMITS.maxBidi),
  fields: z
    .array(
      z.strictObject({
        selector,
        box: Box,
        tag: z.enum(['input', 'textarea']),
        type: z.string().max(50),
        name: z.string().max(200).nullable(),
        id: z.string().max(200).nullable(),
        autocomplete: z.array(z.string().max(200)).max(50),
        inputmode: z.string().max(50).nullable(),
        placeholder: z.string().max(200).nullable(),
        label: z.string().max(200).nullable(),
        ariaLabel: z.string().max(200).nullable(),
        dirAttribute: z.string().max(20).nullable(),
        direction: z.enum(['ltr', 'rtl']),
        unicodeBidi: z.string().max(50),
      }),
    )
    .max(MEASURE_LIMITS.maxFields),
  directionIcons: z
    .array(z.strictObject({ selector, box: Box, name: z.string().max(100) }))
    .max(MEASURE_LIMITS.maxIcons),
  images: z
    .array(
      z.strictObject({
        selector,
        box: Box,
        url: z.string().max(2048),
        naturalWidth: size,
        naturalHeight: size,
      }),
    )
    .max(MEASURE_LIMITS.maxImages),
  truncated: z.boolean(),
})

export interface FactsContext {
  readonly engine: Engine
  readonly version: string
  readonly url: string
  readonly status: number | null
  readonly fontRequests: readonly FontRequestFact[]
  readonly usedFonts?: readonly UsedFontsFact[]
  /** The proxy or the browser stopped requests at their limits. */
  readonly limited: boolean
  /** The step that reads the page's files finished (readPageFiles). */
  readonly filesRead: boolean
  /** axe-core's results; null or absent when axe did not run. */
  readonly a11y?: A11yFacts | null
  /** From the font files and stylesheets read after the render; none when absent. */
  readonly arabicFontCoverage?: readonly WebFontCoverageFact[]
  readonly webFonts?: readonly WebFontFileFact[]
  readonly stylesheets?: StylesheetsFact
  readonly compression?: CompressionFact
  /** Each image file's media type and size, by URL. */
  readonly imageFiles?: ReadonlyMap<string, ImageFile>
}

/** What the render knows of an image file. */
export interface ImageFile {
  readonly type: string | null
  readonly size: number | null
}

const NO_COMPRESSION: CompressionFact = Object.freeze({ checked: 0, uncompressed: [] })

const NO_STYLESHEETS: StylesheetsFact = Object.freeze({ read: 0, unread: 0, physical: [] })

/** The faces the page script measured; none when its result is not what the script returns. */
export function measuredFontFaces(measured: unknown): FontFaceFact[] {
  const faces = z
    .strictObject({ fontFaces: z.array(FontFace).max(MEASURE_LIMITS.maxFontFaces) })
    .loose()
    .safeParse(measured)
  return faces.success ? faces.data.fontFaces : []
}

/** The Arabic text the page script measured; none when its result is not what the script returns. */
export function arabicTextOf(
  measured: unknown,
): Pick<ArabicTextBlock, 'primaryFamily' | 'text' | 'arabicCharacters'>[] {
  const text = z
    .strictObject({
      arabicText: z
        .array(
          z
            .strictObject({
              primaryFamily: z.string().max(200),
              text: z.string().max(MEASURE_LIMITS.textLength),
              arabicCharacters: z.string().max(MEASURE_LIMITS.maxCharacters),
            })
            .loose(),
        )
        .max(MEASURE_LIMITS.maxBlocks),
    })
    .loose()
    .safeParse(measured)
  return text.success ? text.data.arabicText : []
}

/** The page script's result as RenderedFacts; throws when it is not what the script returns. */
export function toFacts(measured: unknown, context: FactsContext): RenderedFacts {
  const parsed = Measured.safeParse(measured)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new Error(
      `the page's measurements are not what the script returns, at ${issue === undefined ? 'the top' : issue.path.join('.') || 'the top'}`,
    )
  }
  const facts = parsed.data
  return {
    engine: context.engine,
    version: context.version,
    url: context.url,
    status: context.status,
    viewport: facts.viewport,
    dir: facts.dir,
    lang: facts.lang,
    viewportMeta: facts.viewportMeta,
    scrollWidth: facts.scrollWidth,
    overflow: facts.overflow,
    arabicText: facts.arabicText,
    arabicTextOmitted: facts.arabicTextOmitted,
    fontFaces: facts.fontFaces,
    fontFacesOmitted: facts.fontFacesOmitted,
    fontRequests: context.fontRequests,
    arabicFontCoverage: context.arabicFontCoverage ?? [],
    webFonts: context.webFonts ?? [],
    stylesheets: context.stylesheets ?? NO_STYLESHEETS,
    ...(context.usedFonts === undefined ? {} : { usedFonts: context.usedFonts }),
    bidi: facts.bidi,
    fields: facts.fields,
    directionIcons: facts.directionIcons,
    compression: context.compression ?? NO_COMPRESSION,
    images: facts.images.map((image) => {
      const file = context.imageFiles?.get(image.url)
      // Joined by the URL as the page gave it, then redacted as every URL in a report is.
      const url = redactUrl(image.url)
      return { ...image, url, type: file?.type ?? null, size: file?.size ?? null }
    }),
    a11y: context.a11y ?? null,
    truncated: facts.truncated,
    limited: context.limited,
    filesRead: context.filesRead,
  }
}
