import type { XrayFacts, XrayFamily } from '@arablyzer/collectors'
import { z } from 'zod'

/** What the Arabic X-ray's pass in the page may keep (docs/design/plans/arabic-native.md §6). */
export interface XrayLimits {
  /** Arabic words counted before the pass stops. */
  readonly maxWords: number
  /** Broken words whose place in the first screen is kept. */
  readonly maxShown: number
  /** Broken words whose place is looked up, however many are in the first screen. */
  readonly maxLookups: number
  readonly textLength: number
  readonly timeMs: number
}

export const XRAY_LIMITS: XrayLimits = {
  maxWords: 20_000,
  maxShown: 40,
  maxLookups: 300,
  textLength: 40,
  timeMs: 1_500,
}

/** A screenshot of the first screen, in JPEG, that is kept in the report: at most this many bytes. */
export const XRAY_IMAGE_BYTES = 70_000

/**
 * Runs in the page. Goes through the Arabic words of the text on the page: a word is broken when
 * it holds a character that no font in its element's font-family list draws (the families come
 * from the facts, judged on the page's web fonts), or U+FFFD, the replacement character. Counts
 * every word, and keeps the place of the broken ones that are in the first screen.
 */
export function xrayPage(families: readonly XrayFamily[], limits: XrayLimits): unknown {
  const started = performance.now()
  window.scrollTo(0, 0)
  const missing = new Map(families.map((family) => [family.fontFamily, new Set(family.chars)]))
  const arabic = /\p{Script=Arabic}/u
  const replacement = '�'
  const skipped = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'OPTION'])
  const known = new Map<Element, ReadonlySet<string> | null>()
  /** The characters missing for an element's text; null when it is not drawn. */
  const missingFor = (element: Element): ReadonlySet<string> | null => {
    const cached = known.get(element)
    if (cached !== undefined) return cached
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    const drawn =
      !skipped.has(element.tagName) &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      (rect.width > 0 || rect.height > 0)
    const chars = drawn ? (missing.get(style.fontFamily.slice(0, 500)) ?? new Set<string>()) : null
    known.set(element, chars)
    return chars
  }
  const words: { text: string; kind: 'glyph' | 'replacement'; box: object }[] = []
  let total = 0
  let broken = 0
  let lookups = 0
  let truncated = false
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (total >= limits.maxWords || performance.now() - started > limits.timeMs) {
      truncated = true
      break
    }
    const data = node.textContent ?? ''
    const parent = node.parentElement
    if (parent === null || (!arabic.test(data) && !data.includes(replacement))) continue
    const chars = missingFor(parent)
    if (chars === null) continue
    for (const match of data.matchAll(/\S+/gu)) {
      const token = match[0]
      const hasReplacement = token.includes(replacement)
      if (!hasReplacement && !arabic.test(token)) continue
      total++
      const kind = hasReplacement
        ? 'replacement'
        : Array.from(token).some((char) => chars.has(char))
          ? 'glyph'
          : null
      if (kind === null) continue
      broken++
      if (lookups >= limits.maxLookups || words.length >= limits.maxShown) continue
      lookups++
      const range = document.createRange()
      range.setStart(node, match.index)
      range.setEnd(node, match.index + token.length)
      const rect = range.getBoundingClientRect()
      const inScreen =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.top < window.innerHeight
      if (!inScreen) continue
      words.push({
        text: token.slice(0, limits.textLength),
        kind,
        box: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      })
    }
  }
  return { total, broken, truncated, words }
}

const pixels = z.number().int().min(-100_000).max(100_000)
const Result = z.strictObject({
  total: z.number().int().min(0).max(1_000_000),
  broken: z.number().int().min(0).max(1_000_000),
  truncated: z.boolean(),
  words: z
    .array(
      z.strictObject({
        text: z.string().max(XRAY_LIMITS.textLength * 2),
        kind: z.enum(['glyph', 'replacement']),
        box: z.strictObject({
          x: pixels,
          y: pixels,
          width: z.number().int().min(0).max(100_000),
          height: z.number().int().min(0).max(100_000),
        }),
      }),
    )
    .max(XRAY_LIMITS.maxShown),
})

/** The pass's result, checked: a page that meddled with it gives no X-ray. */
export function toXrayFacts(result: unknown): XrayFacts | undefined {
  const parsed = Result.safeParse(result)
  if (!parsed.success || parsed.data.broken > parsed.data.total) return undefined
  return parsed.data
}
