import type { ArabicTextBlock, Engine } from '@arablyzer/collectors'
import { defineRule, type DetectorFinding } from '../../rule'

/**
 * A browser is judged only when it drew at least this many Arabic words (M2.3c review). Our own
 * parameter, not a standard's: a language switch, a currency or a cookie notice that a script adds
 * to a page that is not Arabic is a few words, and says nothing of how the page is written. It is
 * small, so a short page of a few sentences is still judged.
 */
export const MIN_DRAWN_WORDS = 20

/**
 * The rule fails when more than this share of the words a browser drew are not in the HTML: more
 * than half. The copy says so, and a test ties the two.
 */
export const SCRIPTED_SHARE = 0.5

/**
 * The characters of a block's text the engines keep (the browser package's MEASURE_LIMITS
 * textLength): a block that long may end in half a word, which is left out.
 */
export const BLOCK_TEXT_LENGTH = 200

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

/** The Arabic words an engine drew, in the blocks it measured, less the words it cut. */
function drawnWords(blocks: readonly ArabicTextBlock[]): number {
  return blocks.reduce((sum, block) => sum + blockWords(block).length, 0)
}

/**
 * The rendered page's Arabic text is mostly not in the HTML as sent (M2.3c): of the Arabic words
 * the engine drew, in the blocks it measured, more than half are words the HTML's text never has.
 * All the text of the body counts as sent, hidden or not, and in <noscript> or <template>: the test
 * is whether the words are in the HTML, not whether a visitor sees them without JavaScript. Scripts
 * may write the rest, which Google renders later than it crawls and not every bot renders at all; the
 * rule measures which words the HTML lacks, and not who wrote them. A browser that drew fewer than
 * MIN_DRAWN_WORDS words is not judged. Each engine is measured on its own; the finding names those
 * where it holds.
 */
export const rule = defineRule({
  id: 'js-only-content',
  version: '1.0.0',
  category: 'index',
  severity: 'moderate',
  needs: ['render'],
  messages: ['scripted'],
  appliesTo: (_page, evidence) =>
    (evidence?.rendered ?? []).some((facts) => drawnWords(facts.arabicText) >= MIN_DRAWN_WORDS),
  detect: ({ page, rendered = [] }): DetectorFinding<'scripted'>[] => {
    const sent = new Set(
      [
        ...(page.text?.segments.map((segment) => segment.text) ?? []),
        ...(page.text?.hidden ?? []),
      ].flatMap((text) => arabicWords(text)),
    )
    const measured: [Engine, Measure][] = []
    for (const facts of rendered) {
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
      if (total >= MIN_DRAWN_WORDS) measured.push([facts.engine, { missing, total, first }])
    }
    const mostly = measured.filter(([, { missing, total }]) => missing > total * SCRIPTED_SHARE)
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
