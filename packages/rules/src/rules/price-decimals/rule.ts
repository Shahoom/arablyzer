import type { PageFacts, TextSegment } from '@arablyzer/collectors'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'one-decimal' | 'two-decimals'

interface Currency {
  readonly code: string
  /** Latin markers, which may not touch another Latin letter: "KD 3.500", "وKD 3.500". */
  readonly latin: string
  /** Arabic markers, which may not touch another letter. */
  readonly arabic: string
}

/**
 * The currencies whose prices this rule reads, all with three decimals in ISO 4217, and what
 * marks a number as a price in them: the ISO code, the Latin abbreviation, the Arabic
 * abbreviation and the Arabic name. «ريال» or «دينار» alone could be another country's.
 */
export const CURRENCIES: readonly Currency[] = [
  {
    code: 'OMR',
    latin: 'OMR|R\\.?O\\.?',
    arabic: 'ر\\.\\s?ع\\.?|ريال(?:ا\u064b|\u064bا|ا|ات)? عماني(?:ا\u064b|\u064bا|ا|ة)?',
  },
  {
    code: 'KWD',
    latin: 'KWD|K\\.?D\\.?',
    arabic: 'د\\.\\s?ك\\.?|دينار(?:ا\u064b|\u064bا|ا)? كويتي(?:ا\u064b|\u064bا|ا)?|دنانير كويتية',
  },
  {
    code: 'BHD',
    latin: 'BHD|B\\.?D\\.?',
    arabic: 'د\\.\\s?ب\\.?|دينار(?:ا\u064b|\u064bا|ا)? بحريني(?:ا\u064b|\u064bا|ا)?|دنانير بحرينية',
  },
]

const DIGITS = '0-9\u0660-\u0669\u06f0-\u06f9'
/** Digits, with thousands separators and decimal marks between them (٬ and ٫ included). */
const AMOUNT = new RegExp(`[${DIGITS}]+(?:[.,\u066b\u066c][${DIGITS}]+)*`, 'gu')
/** What may stand between a number and its currency: spaces and directional marks. */
const GAP = '[\\s\u200e\u200f\u061c\u2066-\u2069]{0,4}'
const DIRECTIONAL_MARKS = /[\u200e\u200f\u061c\u2066-\u2069]/g
/** How far from a number its currency marker can start; the longest is under 20 characters. */
const REACH = 32

const MARKER_AFTER = CURRENCIES.map(
  ({ code, latin, arabic }) =>
    [code, new RegExp(`^${GAP}(?:(?:${latin})(?![A-Za-z])|(?:${arabic})(?!\\p{L}))`, 'u')] as const,
)
const MARKER_BEFORE = CURRENCIES.map(
  ({ code, latin, arabic }) =>
    [
      code,
      new RegExp(`(?:(?<![A-Za-z])(?:${latin})|(?<!\\p{L})(?:${arabic}))${GAP}$`, 'u'),
    ] as const,
)

interface Price {
  readonly currency: string
  /** As written, number and marker, with spaces made plain. */
  readonly text: string
  /** The same price with three decimals. */
  readonly fixed: string
  /** Digits after the decimal mark; null when the separators do not say which one it is. */
  readonly decimals: number | null
  readonly segment: TextSegment
  readonly offset: number
}

export const rule = defineRule({
  id: 'price-decimals',
  version: '1.0.0',
  category: 'commerce',
  severity: 'minor',
  needs: ['text'],
  messages: ['one-decimal', 'two-decimals'],
  appliesTo: (page) => !prices(page).next().done,
  detect: ({ page }) => {
    const first = new Map<string, Price>()
    const count = new Map<string, number>()
    for (const price of prices(page)) {
      if (price.decimals !== 1 && price.decimals !== 2) continue
      if (!first.has(price.currency)) first.set(price.currency, price)
      count.set(price.currency, (count.get(price.currency) ?? 0) + 1)
    }
    return [...first.values()].map((price): DetectorFinding<Message> => {
      let newlines = 0
      for (let i = 0; i < price.offset; i++) if (price.segment.text.charCodeAt(i) === 10) newlines++
      const { location } = price.segment
      return {
        message: price.decimals === 1 ? 'one-decimal' : 'two-decimals',
        values: {
          price: price.text,
          fixed: price.fixed,
          currency: price.currency,
          count: count.get(price.currency) ?? 0,
        },
        selector: price.segment.selector,
        ...(location === null ? {} : { location: { line: location.line + newlines } }),
        key: price.currency,
      }
    })
  },
})

/** Prices in the page's visible text, outside code, in the order they appear. */
function* prices(page: PageFacts): Generator<Price> {
  for (const run of runs(page.text?.segments ?? [])) {
    // Where the last price ended: its marker is not also the next number's.
    let taken = 0
    for (const match of run.text.matchAll(AMOUNT)) {
      const amount = match[0]
      const start = match.index
      const end = start + amount.length
      const price = priced(run.text, start, end, taken)
      if (price === null) continue
      taken = price.to
      const piece = run.pieces.findLast((candidate) => candidate.start <= start)
      if (piece === undefined) continue
      const decimals = decimalsOf(amount)
      const zeros = decimals === null ? '' : zero(amount).repeat(Math.max(0, 3 - decimals))
      yield {
        currency: price.currency,
        text: plain(run.text.slice(price.from, price.to)),
        fixed: plain(`${run.text.slice(price.from, end)}${zeros}${run.text.slice(end, price.to)}`),
        decimals,
        segment: piece.segment,
        offset: start - piece.start,
      }
    }
  }
}

/**
 * The currency marker touching the number at start..end, and where the price begins and ends.
 * A marker before the number comes first, as in "OMR 12.500 OMR 15.000", unless an earlier price
 * took it, as in "12.500 ر.ع. 15.000 ر.ع.".
 */
function priced(
  text: string,
  start: number,
  end: number,
  taken: number,
): { currency: string; from: number; to: number } | null {
  const before = text.slice(Math.max(0, start - REACH), start)
  for (const [currency, pattern] of MARKER_BEFORE) {
    const marker = pattern.exec(before)
    const from = start - (marker?.[0].length ?? 0)
    if (marker !== null && from >= taken) return { currency, from, to: end }
  }
  const after = text.slice(end, end + REACH)
  for (const [currency, pattern] of MARKER_AFTER) {
    const marker = pattern.exec(after)
    if (marker !== null) return { currency, from: start, to: end + marker[0].length }
  }
  return null
}

/**
 * Digits after the one decimal mark (. or ٫). Commas and ٬ group thousands. Without a mark
 * there are no decimals; with several marks, or a comma after the mark (1.250,50), the
 * separators do not say which is the decimal one.
 */
function decimalsOf(amount: string): number | null {
  const marks = amount.match(/[.\u066b]/g) ?? []
  if (marks.length === 0) return 0
  if (marks.length > 1) return null
  const decimals = amount.slice(amount.search(/[.\u066b]/) + 1)
  return /[,\u066c]/.test(decimals) ? null : decimals.length
}

/** Zero in the digits the amount is written in. */
function zero(amount: string): string {
  if (/[\u0660-\u0669]/.test(amount)) return '\u0660'
  if (/[\u06f0-\u06f9]/.test(amount)) return '\u06f0'
  return '0'
}

function plain(text: string): string {
  return text.replace(DIRECTIONAL_MARKS, '').replace(/\s+/g, ' ')
}

interface Run {
  readonly text: string
  /** Each text node in the run, and where its text starts in the run's text. */
  readonly pieces: readonly { readonly segment: TextSegment; readonly start: number }[]
}

/**
 * Text that reads as one line: text nodes that only inline elements separate, as in
 * `<bdi>12.500&nbsp;<span>ر.ع.</span></bdi>`, joined. Code breaks a run.
 */
function* runs(segments: readonly TextSegment[]): Generator<Run> {
  let text = ''
  let pieces: { segment: TextSegment; start: number }[] = []
  for (const segment of segments) {
    if (pieces.length > 0 && (segment.precededBy === '' || segment.code)) {
      yield { text, pieces }
      text = ''
      pieces = []
    }
    if (segment.code) continue
    // Text nodes of only spaces are not segments; precededBy keeps their last character.
    if (pieces.length > 0 && segment.precededBy !== text.at(-1)) text += segment.precededBy
    pieces.push({ segment, start: text.length })
    text += segment.text
  }
  if (pieces.length > 0) yield { text, pieces }
}
