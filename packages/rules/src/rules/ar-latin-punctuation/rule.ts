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

function findMarks(segment: TextSegment): DetectorFinding<'latin-mark'>[] {
  if (segment.code) return []
  const { text } = segment
  const positions = [...text.matchAll(LATIN_MARK)].map((match) => match.index + match[0].length - 1)
  // A mark at the start of this text can follow an Arabic word in an inline element: <b>نص</b>,
  if (ARABIC_FORM[text.charAt(0)] !== undefined && ARABIC_LETTER_OR_MARK.test(segment.precededBy)) {
    positions.unshift(0)
  }
  return positions
    .filter((position) => !inUrl(text, position))
    .map((position) => {
      const found = text.charAt(position)
      const snippet = context(text, position)
      return {
        message: 'latin-mark' as const,
        values: { found, suggested: ARABIC_FORM[found] ?? found },
        selector: segment.selector,
        snippet,
        ...(segment.location === null
          ? {}
          : { location: { line: segment.location.line + countNewlines(text.slice(0, position)) } }),
        key: `${snippet}#${position}`,
      }
    })
}

/** A mark inside a word that contains "/" belongs to a URL or a path, e.g. example.com/بحث?q=1. */
function inUrl(text: string, position: number): boolean {
  const start = text.slice(0, position).search(/\S*$/)
  const end = text.slice(position).search(/\s|$/)
  return text.slice(start, position + end).includes('/')
}

function context(text: string, position: number): string {
  const start = Math.max(0, position - CONTEXT)
  const end = Math.min(text.length, position + CONTEXT + 1)
  const snippet = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${snippet}${end < text.length ? '…' : ''}`
}

function countNewlines(text: string): number {
  return text.split('\n').length - 1
}
