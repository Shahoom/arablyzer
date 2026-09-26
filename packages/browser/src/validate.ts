import type { Engine, FontRequestFact, RenderedFacts, UsedFontsFact } from '@arablyzer/collectors'
import { z } from 'zod'
import { MEASURE_LIMITS } from './measure'

/** Lengths the page script already keeps to; anything longer came from a page that meddled. */
const pixels = z.number().int().min(-10_000_000).max(10_000_000)
const size = z.number().int().min(0).max(10_000_000)
const Box = z.strictObject({ x: pixels, y: pixels, width: size, height: size })
const selector = z.string().max(300)

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
      }),
    )
    .max(MEASURE_LIMITS.maxBlocks),
  arabicTextOmitted: z.number().int().min(0),
  fontFaces: z
    .array(
      z.strictObject({
        family: z.string().max(200),
        status: z.enum(['unloaded', 'loading', 'loaded', 'error']),
        weight: z.string().max(50),
        style: z.string().max(50),
        unicodeRange: z.string().max(2000),
      }),
    )
    .max(MEASURE_LIMITS.maxFontFaces),
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
  truncated: z.boolean(),
})

export interface FactsContext {
  readonly engine: Engine
  readonly version: string
  readonly url: string
  readonly status: number | null
  readonly fontRequests: readonly FontRequestFact[]
  readonly usedFonts?: readonly UsedFontsFact[]
}

/** The page script's result as RenderedFacts; throws when it is not what the script returns. */
export function toFacts(measured: unknown, context: FactsContext): RenderedFacts {
  const facts = Measured.parse(measured)
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
    fontRequests: context.fontRequests,
    ...(context.usedFonts === undefined ? {} : { usedFonts: context.usedFonts }),
    bidi: facts.bidi,
    truncated: facts.truncated,
  }
}
