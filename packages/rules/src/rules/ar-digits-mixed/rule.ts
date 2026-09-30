import type { SourceLocation, TextSegment } from '@arablyzer/collectors'
import { isArabicText } from '../../lib/arabic'
import { defineRule, type DetectorFinding } from '../../rule'

type DigitSet = 'western' | 'eastern' | 'persian'

const DIGITS = '0-9\u0660-\u0669\u06f0-\u06f9'
const SET_OF: readonly [DigitSet, RegExp][] = [
  ['western', /[0-9]/],
  ['eastern', /[\u0660-\u0669]/],
  ['persian', /[\u06f0-\u06f9]/],
]
/** International numbers (+968 9123 4567) are written in Western digits by convention. */
const PHONE = new RegExp(`\\+[${DIGITS}](?:[${DIGITS}]|[ -](?=[${DIGITS}])){5,}`, 'gu')
/** The year of a copyright notice (© 2024, © 2019–2024): themes write it in Western digits. */
const COPYRIGHT = new RegExp(`©\\s*[${DIGITS}]{4}(?:\\s*[-\u2013]\\s*[${DIGITS}]{4})?`, 'gu')
/** A number: digits, with separators and decimal marks between them (٫ and ٬ included). */
const NUMBER = new RegExp(`[${DIGITS}](?:[${DIGITS}.,\u066b\u066c:/-]*[${DIGITS}])?`, 'gu')
const LATIN_LETTER = /\p{Script=Latin}/u
/** Skipped when looking for the word next to a number: "Windows 11", "Model: 500". */
const GAP = /[\s:،,.()\-–]/u

interface Sighting {
  readonly example: string
  readonly selector: string
  readonly location: { readonly line: number } | null
  /** Its order among all numbers on the page. */
  readonly order: number
}

export const rule = defineRule({
  id: 'ar-digits-mixed',
  version: '1.0.0',
  category: 'ar-content',
  severity: 'minor',
  needs: ['text'],
  messages: ['mixed', 'persian'],
  appliesTo: isArabicText,
  detect: ({ page }) => {
    const first = new Map<DigitSet, Sighting>()
    const count = new Map<DigitSet, number>()
    let order = 0
    for (const segment of page.text?.segments ?? []) {
      if (segment.code) continue
      for (const { number, offset } of numbers(segment.text)) {
        order++
        for (const [set, pattern] of SET_OF) {
          if (!pattern.test(number)) continue
          count.set(set, (count.get(set) ?? 0) + 1)
          if (!first.has(set)) {
            first.set(set, { example: number, order, ...where(segment, offset) })
          }
        }
      }
    }
    const findings: DetectorFinding<'mixed' | 'persian'>[] = []
    const western = first.get('western')
    const eastern = first.get('eastern')
    if (western !== undefined && eastern !== undefined) {
      const westernCount = count.get('western') ?? 0
      const easternCount = count.get('eastern') ?? 0
      // Point at the set used less, where it first shows; on a tie, the one that came later.
      const odd =
        westernCount < easternCount ||
        (westernCount === easternCount && western.order > eastern.order)
          ? western
          : eastern
      findings.push({
        message: 'mixed',
        values: { western: western.example, eastern: eastern.example, westernCount, easternCount },
        ...evidence(odd),
        key: 'mixed',
      })
    }
    const persian = first.get('persian')
    if (persian !== undefined) {
      findings.push({
        message: 'persian',
        values: { persian: persian.example, persianCount: count.get('persian') ?? 0 },
        ...evidence(persian),
        key: 'persian',
      })
    }
    return findings
  },
})

/** Numbers in a text, leaving out phone numbers, copyright years and numbers in Latin words. */
function* numbers(text: string): Generator<{ number: string; offset: number }> {
  const blank = (found: string) => ' '.repeat(found.length)
  const blanked = text.replace(PHONE, blank).replace(COPYRIGHT, blank)
  for (const match of blanked.matchAll(NUMBER)) {
    const end = match.index + match[0].length
    if (LATIN_LETTER.test(neighbour(blanked, match.index, -1))) continue
    if (LATIN_LETTER.test(neighbour(blanked, end - 1, 1))) continue
    yield { number: match[0], offset: match.index }
  }
}

/** The nearest character before (-1) or after (1) a position, past spaces and punctuation. */
function neighbour(text: string, from: number, step: -1 | 1): string {
  for (let i = from + step; i >= 0 && i < text.length; i += step) {
    const char = text.charAt(i)
    if (!GAP.test(char)) return char
  }
  return ''
}

function where(segment: TextSegment, offset: number): Pick<Sighting, 'selector' | 'location'> {
  let newlines = 0
  for (let i = 0; i < offset; i++) if (segment.text.charCodeAt(i) === 10) newlines++
  const location: SourceLocation | null = segment.location
  return {
    selector: segment.selector,
    location: location === null ? null : { line: location.line + newlines },
  }
}

function evidence(sighting: Sighting) {
  return {
    selector: sighting.selector,
    ...(sighting.location === null ? {} : { location: sighting.location }),
  }
}
