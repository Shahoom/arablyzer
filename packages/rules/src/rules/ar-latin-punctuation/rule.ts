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
  detect: ({ page }) => (page.text?.segments ?? []).flatMap(findMarks),
})

/** One pass over the text, so a long text node costs no more than its length (M0.2 review). */
function findMarks(segment: TextSegment): DetectorFinding<'latin-mark'>[] {
  if (segment.code) return []
  const { text } = segment
  const positions = [...text.matchAll(LATIN_MARK)].map((match) => match.index + match[0].length - 1)
  // A mark at the start of this text can follow an Arabic word in an inline element: <b>نص</b>,
  if (ARABIC_FORM[text.charAt(0)] !== undefined && ARABIC_LETTER_OR_MARK.test(segment.precededBy)) {
    positions.unshift(0)
  }
  const urls = urlWords(text)
  const findings: DetectorFinding<'latin-mark'>[] = []
  let url = 0
  let scanned = 0
  let newlines = 0
  for (const position of positions) {
    for (; scanned < position; scanned++) if (text.charCodeAt(scanned) === 10) newlines++
    while (url < urls.length && (urls[url]?.end ?? 0) <= position) url++
    // A mark inside a word that contains "/" belongs to a URL or a path: example.com/بحث?q=1
    if ((urls[url]?.start ?? Number.POSITIVE_INFINITY) <= position) continue
    const found = text.charAt(position)
    const snippet = context(text, position)
    findings.push({
      message: 'latin-mark',
      values: { found, suggested: ARABIC_FORM[found] ?? found },
      selector: segment.selector,
      snippet,
      ...(segment.location === null
        ? {}
        : { location: { line: segment.location.line + newlines } }),
      key: `${snippet}#${position}`,
    })
  }
  return findings
}

/** [start, end) of each whitespace-separated word that contains "/", in text order. */
function urlWords(text: string): { start: number; end: number }[] {
  const words: { start: number; end: number }[] = []
  for (const match of text.matchAll(/\S+/g)) {
    if (match[0].includes('/'))
      words.push({ start: match.index, end: match.index + match[0].length })
  }
  return words
}

function context(text: string, position: number): string {
  const start = Math.max(0, position - CONTEXT)
  const end = Math.min(text.length, position + CONTEXT + 1)
  const snippet = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${snippet}${end < text.length ? '…' : ''}`
}
