import type { SourceLocation, TextSegment } from '@arablyzer/collectors'
import { isArabicPage, STRETCHED_WORD } from '../../lib/arabic'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'tatweel' | 'invisible' | 'digits' | 'diacritics' | 'presentation' | 'image-text'

/** Zero-width characters that split a word for a tokenizer and draw nothing: ZWSP, word joiner, BOM. */
const INVISIBLE = /[\u200b\u2060\ufeff]/u
/** Direction marks (LRM, RLM, ALM), which belong between words and numbers, not inside them. */
const MARK = /(?<=[\p{L}\p{N}])[\u200e\u200f\u061c](?=[\p{L}\p{N}])/u
/** Arabic Presentation Forms-A and -B, less the ornate parentheses and the ﷺ ﷻ ﷼ ﷽ symbols. */
const PRESENTATION = /[ﭐ-ﴽ﵀-﷏ﷰ-ﷹﹰ-﻾]/u
const DIGIT_RUN = /[0-9٠-٩۰-۹](?:[0-9٠-٩۰-۹.,٫٬/:-]*[0-9٠-٩۰-۹])?/gu
const HARAKAT = /[ً-ْٰ]/gu
const ARABIC_LETTER = /(?=\p{L})\p{Script=Arabic}/gu
/** Annotation marks of Quranic text, where the diacritics are the point. */
const QURANIC = /[ۖ-ۭ࣓-࣡]/u
/** A segment this thick in harakat (per letter), of this many letters or more, is fully vowelled text. */
const HEAVY_RATIO = 0.25
const HEAVY_MIN_LETTERS = 20
/** Fully vowelled text is reported when it makes up this many letters. */
const HEAVY_TOTAL_LETTERS = 100
/** A page with fewer Arabic letters than this in its text, but Arabic sentences in image alts. */
const THIN_TEXT_LETTERS = 60
const ALT_MIN_WORDS = 8

interface Tally {
  count: number
  first: {
    example: string
    selector: string
    location: { line: number } | null
    extra?: string
  } | null
}

const tally = (): Tally => ({ count: 0, first: null })

function lineOf(segment: TextSegment, offset: number): { line: number } | null {
  if (segment.location === null) return null
  let newlines = 0
  for (let i = 0; i < offset; i++) if (segment.text.charCodeAt(i) === 10) newlines++
  const location: SourceLocation = segment.location
  return { line: location.line + newlines }
}

/** Invisible characters written out, so a report can show what is in a word: «ا⟨U+200B⟩ل». */
function shown(word: string): string {
  return Array.from(word, (char) =>
    INVISIBLE.test(char) || /[\u200e\u200f\u061c]/u.test(char)
      ? `⟨U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}⟩`
      : char,
  ).join('')
}

/**
 * Arabic text that people read fine and machines (search indexes, AI assistants, retrieval and
 * tokenizers) read badly (docs/design/plans/arabic-native.md §4). Six kinds, each told with its
 * count, its first example and the fix: tatweel inside words, invisible characters, digits of two
 * sets inside one number, text thick with diacritics, presentation-form letters, and Arabic that is
 * only in pictures. One finding for each kind found; none is deducted for more than minor.
 */
export const rule = defineRule({
  id: 'ar-ai-readability',
  version: '1.0.0',
  category: 'ar-content',
  severity: 'minor',
  needs: ['html', 'text'],
  messages: ['tatweel', 'invisible', 'digits', 'diacritics', 'presentation', 'image-text'],
  appliesTo: (page) => page.text !== null && page.html !== null && isArabicPage(page),
  detect: ({ page }): DetectorFinding<Message>[] => {
    const tatweel = tally()
    const invisible = tally()
    const digits = tally()
    const presentation = tally()
    const heavy = tally()
    let heavyLetters = 0
    for (const segment of page.text?.segments ?? []) {
      if (segment.code) continue
      const text = segment.text
      const letters = text.match(ARABIC_LETTER)?.length ?? 0
      if (letters === 0 && !INVISIBLE.test(text)) continue
      // Diacritics: the segment as a whole.
      if (letters >= HEAVY_MIN_LETTERS && !QURANIC.test(text)) {
        const marks = text.match(HARAKAT)?.length ?? 0
        if (marks / letters >= HEAVY_RATIO) {
          heavy.count++
          heavyLetters += letters
          heavy.first ??= {
            example: text.trim().slice(0, 40),
            selector: segment.selector,
            location: lineOf(segment, 0),
          }
        }
      }
      for (const word of text.matchAll(/\S+/gu)) {
        const token = word[0]
        const at = (kind: Tally, example = token, extra?: string) => {
          kind.count++
          kind.first ??= {
            example: example.slice(0, 60),
            selector: segment.selector,
            location: lineOf(segment, word.index),
            ...(extra === undefined ? {} : { extra }),
          }
        }
        if (token.includes('ـ') && STRETCHED_WORD.test(token)) {
          at(tatweel, token, token.replaceAll('ـ', ''))
        }
        if (INVISIBLE.test(token) || MARK.test(token)) at(invisible, shown(token).slice(0, 60))
        if (PRESENTATION.test(token)) at(presentation, token, token.normalize('NFKC'))
        for (const run of token.matchAll(DIGIT_RUN)) {
          const value = run[0]
          if (/[0-9]/.test(value) && /[٠-٩۰-۹]/.test(value)) {
            digits.count++
            digits.first ??= {
              example: value,
              selector: segment.selector,
              location: lineOf(segment, word.index + run.index),
            }
          }
        }
      }
    }
    const findings: DetectorFinding<Message>[] = []
    const add = (message: Message, kind: Tally, values: Record<string, string | number>) => {
      if (kind.first === null) return
      findings.push({
        message,
        values,
        selector: kind.first.selector,
        ...(kind.first.location === null ? {} : { location: kind.first.location }),
        key: message,
      })
    }
    add('tatweel', tatweel, {
      count: tatweel.count,
      example: tatweel.first?.example ?? '',
      clean: tatweel.first?.extra ?? '',
    })
    add('invisible', invisible, { count: invisible.count, example: invisible.first?.example ?? '' })
    add('digits', digits, { count: digits.count, example: digits.first?.example ?? '' })
    if (heavyLetters >= HEAVY_TOTAL_LETTERS) {
      add('diacritics', heavy, { count: heavy.count, example: heavy.first?.example ?? '' })
    }
    add('presentation', presentation, {
      count: presentation.count,
      example: presentation.first?.example ?? '',
      normalized: presentation.first?.extra ?? '',
    })
    // Arabic sentences of a few lines in image alts: the text is in pictures, and the alt is all a machine has.
    if ((page.text?.letters.arabic ?? 0) < THIN_TEXT_LETTERS) {
      const images = (page.html?.textAlternatives ?? []).filter(
        (alt) =>
          alt.tag === 'img' &&
          alt.source === 'alt' &&
          (alt.text.match(ARABIC_LETTER)?.length ?? 0) * 2 > alt.text.replace(/\s/g, '').length &&
          alt.text.split(/\s+/u).length >= ALT_MIN_WORDS,
      )
      const first = images[0]
      if (first !== undefined) {
        findings.push({
          message: 'image-text',
          values: { count: images.length, example: first.text.slice(0, 60) },
          selector: first.selector,
          ...(first.location === null ? {} : { location: first.location }),
          key: 'image-text',
        })
      }
    }
    return findings
  },
})
