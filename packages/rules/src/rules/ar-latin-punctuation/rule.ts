import type { TextSegment } from '@arablyzer/collectors'
import { isMostlyArabic } from '../../lib/arabic'
import { defineRule, type DetectorFinding } from '../../rule'

/** Latin mark → its Arabic form (U+060C, U+061B, U+061F). */
const ARABIC_FORM: Readonly<Record<string, string>> = { ',': '،', ';': '؛', '?': '؟' }
/** An Arabic-script letter, then any harakat or tatweel, then a Latin comma, semicolon or question mark. */
const LATIN_MARK = /(?=\p{L})\p{Script=Arabic}[ً-ٰٟـ]*[,;?]/gu
const ARABIC_LETTER_OR_MARK = /^(?:(?=\p{L})\p{Script=Arabic}|[ً-ٰٟـ])$/u
/** Characters of context on each side of the mark in the snippet. */
const CONTEXT = 60

export const rule = defineRule({
  id: 'ar-latin-punctuation',
  version: '1.0.0',
  category: 'ar-content',
  severity: 'minor',
  needs: ['text'],
  messages: ['latin-mark'],
  appliesTo: isMostlyArabic,
  // Lazily: a page can hold millions of marks, and only the first few are reported.
  detect: function* ({ page }) {
    for (const segment of page.text?.segments ?? []) yield* findMarks(segment)
  },
})

/** One pass over the text, so a long text node costs no more than its length (M0.2 review). */
function* findMarks(segment: TextSegment): Generator<DetectorFinding<'latin-mark'>> {
  if (segment.code) return
  const { text } = segment
  const words = urlWords(text)
  let word = words.next()
  let scanned = 0
  let newlines = 0
  for (const position of markPositions(segment)) {
    for (; scanned < position; scanned++) if (text.charCodeAt(scanned) === 10) newlines++
    while (!word.done && word.value.end <= position) word = words.next()
    // A mark inside a word that contains "/" belongs to a URL or a path: example.com/بحث?q=1
    if (!word.done && word.value.start <= position) continue
    const found = text.charAt(position)
    const snippet = context(text, position)
    yield {
      message: 'latin-mark',
      values: { found, suggested: ARABIC_FORM[found] ?? found },
      selector: segment.selector,
      snippet,
      ...(segment.location === null
        ? {}
        : { location: { line: segment.location.line + newlines } }),
      key: `${snippet}#${position}`,
    }
  }
}

/** Where the Latin marks that follow Arabic letters are, in text order. */
function* markPositions(segment: TextSegment): Generator<number> {
  const { text } = segment
  // A mark at the start of this text can follow an Arabic word in an inline element: <b>نص</b>,
  if (ARABIC_FORM[text.charAt(0)] !== undefined && ARABIC_LETTER_OR_MARK.test(segment.precededBy)) {
    yield 0
  }
  for (const match of text.matchAll(LATIN_MARK)) yield match.index + match[0].length - 1
}

/** [start, end) of each whitespace-separated word that contains "/", in text order. */
function* urlWords(text: string): Generator<{ start: number; end: number }> {
  for (const match of text.matchAll(/\S+/g)) {
    if (match[0].includes('/')) yield { start: match.index, end: match.index + match[0].length }
  }
}

function context(text: string, position: number): string {
  const start = Math.max(0, position - CONTEXT)
  const end = Math.min(text.length, position + CONTEXT + 1)
  const snippet = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${snippet}${end < text.length ? '…' : ''}`
}
