import type { ArabicTextBlock, Engine } from '@arablyzer/collectors'
import { hasRenderedArabic } from '../../lib/rendered'
import { defineRule, type DetectorFinding } from '../../rule'

/**
 * The characters of a block's text the engines keep (the browser package's MEASURE_LIMITS
 * textLength): a block that long may end in half a word, which is left out.
 */
const BLOCK_TEXT_LENGTH = 200

/** A run of Arabic-script letters. */
const ARABIC_WORD = /(?:(?=\p{Script=Arabic})\p{L})+/gu
/** Marks (harakat among them) and tatweel, which the same word may have or not. */
const MARKS = /[\p{M}ـ]/gu

/**
 * A text's Arabic words, as the same words whatever their marks, tatweel or presentation forms:
 * compatibility forms folded (NFKC), then marks and tatweel left out.
 */
function arabicWords(text: string): string[] {
  return text.normalize('NFKC').replace(MARKS, '').match(ARABIC_WORD) ?? []
}

/** A block's words, less the last when the engine cut the block's text at its length. */
function blockWords(block: ArabicTextBlock): string[] {
  const words = arabicWords(block.text)
  return block.text.length >= BLOCK_TEXT_LENGTH ? words.slice(0, -1) : words
}

interface Measure {
  readonly missing: number
  readonly total: number
  /** The first block with a word the HTML lacks. */
  readonly first: ArabicTextBlock | undefined
}

/**
 * The rendered page's Arabic text is mostly not in the HTML as sent (M2.3c): of the Arabic words
 * the engine drew, in the blocks it measured, more than half are words the HTML's text never has,
 * so scripts wrote them. Google renders JavaScript, but later than it crawls, and not every bot
 * runs it. Each engine is measured on its own; the finding names those where it holds.
 */
export const rule = defineRule({
  id: 'js-only-content',
  version: '1.0.0',
  category: 'index',
  severity: 'moderate',
  needs: ['render'],
  messages: ['scripted'],
  appliesTo: (_page, evidence) => hasRenderedArabic(evidence),
  detect: ({ page, rendered = [] }): DetectorFinding<'scripted'>[] => {
    const sent = new Set(
      (page.text?.segments ?? []).flatMap((segment) => arabicWords(segment.text)),
    )
    const measured: [Engine, Measure][] = rendered.map((facts) => {
      let missing = 0
      let total = 0
      let first: ArabicTextBlock | undefined
      for (const block of facts.arabicText) {
        for (const word of blockWords(block)) {
          total++
          if (sent.has(word)) continue
          missing++
          first ??= block
        }
      }
      return [facts.engine, { missing, total, first }]
    })
    const mostly = measured.filter(([, { missing, total }]) => missing * 2 > total)
    const [shown] = mostly
    if (shown === undefined) return []
    const [, { missing, total, first }] = shown
    return [
      {
        message: 'scripted',
        values: { missing, total, share: Math.round((missing / total) * 100) },
        ...(first === undefined
          ? {}
          : { selector: first.selector, snippet: first.text, box: first.box }),
        engines: mostly.map(([engine]) => engine),
      },
    ]
  },
})
