import type { PageFacts } from '@arablyzer/collectors'
import { isArabicPage } from '../../lib/arabic'
import { hasPattern, shownPattern, type PatternField } from '../../lib/form-fields'
import { MAX_PATTERN_LENGTH, pageTester } from '../../lib/html-pattern'
import { defineRule } from '../../rule'

const NUMERIC_INPUTMODES = new Set(['numeric', 'decimal', 'tel'])
const NUMERIC_AUTOCOMPLETE = new Set([
  'tel',
  'tel-national',
  'tel-local',
  'tel-area-code',
  'tel-local-prefix',
  'tel-local-suffix',
  'tel-extension',
  'tel-country-code',
  'postal-code',
  'one-time-code',
  'cc-number',
  'cc-csc',
  'cc-exp',
  'cc-exp-month',
  'cc-exp-year',
  'bday-day',
  'bday-month',
  'bday-year',
  'transaction-amount',
])
/** Escapes such as \d, \+ and \p{Nd}, which hold letters without allowing any. */
const ESCAPES = /\\[pP]\{[^}]*\}|\\u\{[^}]*\}|\\u[0-9A-Fa-f]{4}|\\x[0-9A-Fa-f]{2}|\\./g
/** Character classes, quantifiers and escapes: what is left of a pattern is its literal text. */
const NOT_LITERAL =
  /\[(?:\\.|[^\]\\])*\]|\{[^}]*\}|\\[pPu]\{[^}]*\}|\\u[0-9A-Fa-f]{4}|\\x[0-9A-Fa-f]{2}|\\[^+]/g

/** Lengths to try, the common ones for phone numbers and codes first. */
const LENGTHS = [8, 9, 10, 11, 12, 7, 6, 5, 4, 13, 14, 15, 16, 3, 2, 1]
const FILL = '91234567809123456780'
/** Digits for the x's of a placeholder. */
const CYCLE = '1234567890'
/** A number in a placeholder, where x, #, * and _ stand for digits: "9xxxxxxx", "+968 9XXX XXXX". */
const PLACEHOLDER_NUMBER = /(?<![A-Za-z])\+?[0-9xX#*_(][0-9xX#*_ ()\-.]*[0-9xX#*_](?![A-Za-z])/g

export const rule = defineRule({
  id: 'form-arabic-digits-rejected',
  version: '1.0.0',
  category: 'forms',
  severity: 'moderate',
  needs: ['html', 'text'],
  messages: ['rejected'],
  appliesTo: (page) => isArabicPage(page) && numericFields(page).length > 0,
  detect: ({ page }) => {
    if (!isArabicPage(page)) return []
    const test = pageTester()
    return numericFields(page).flatMap((field) => {
      const western = candidates(field)
      const results = test(field.pattern, [...western, ...western.map(eastern)])
      if (typeof results === 'string') return []
      const accepted = western.flatMap((value, index) => (results[index] === true ? [index] : []))
      // Like with like: only numbers the field takes in Western digits, and only when it takes
      // none of them in Arabic-Indic digits.
      const [first] = accepted
      if (first === undefined) return []
      if (accepted.some((index) => results[western.length + index] === true)) return []
      const value = western[first] ?? ''
      return [
        {
          message: 'rejected' as const,
          values: { western: value, eastern: eastern(value), pattern: shownPattern(field.pattern) },
          selector: field.selector,
          ...(field.snippet === null ? {} : { snippet: field.snippet }),
          ...(field.location === null ? {} : { location: field.location }),
        },
      ]
    })
  },
})

/** Inputs for numbers that have a pattern: phone numbers, codes, postal codes, card numbers. */
function numericFields(page: PageFacts): PatternField[] {
  return (page.html?.fields ?? []).filter(
    (field): field is PatternField => hasPattern(field) && isNumeric(field),
  )
}

function isNumeric(field: PatternField): boolean {
  return (
    field.type === 'tel' ||
    NUMERIC_INPUTMODES.has(field.inputmode ?? '') ||
    field.autocomplete.some((token) => NUMERIC_AUTOCOMPLETE.has(token)) ||
    isDigitPattern(field.pattern)
  )
}

/** A pattern of digits and punctuation only: [0-9]{8}, \d{6}, (\+968)?[79]\d{7}. */
function isDigitPattern(pattern: string): boolean {
  return /\\d|0-9|\\p\{Nd?\}/.test(pattern) && !/[A-Za-z]/.test(pattern.replace(ESCAPES, ''))
}

/**
 * Western-digit numbers to try: the placeholder's example first, then numbers of common
 * lengths, bare, after "+", and after the digits the pattern itself spells out ("05", "+968").
 */
function candidates(field: PatternField): string[] {
  // A placeholder longer than any real one is not read: a page could make it slow to search.
  const placeholder = field.placeholder ?? ''
  const example = placeholder.length > MAX_PATTERN_LENGTH ? '' : westernDigits(placeholder)
  const fromPlaceholder = [...example.matchAll(PLACEHOLDER_NUMBER)]
    .map(([number]) => number)
    .filter((number) => (number.match(/[0-9xX#*_]/g) ?? []).length >= 3)
    .map((number) => {
      let next = 0
      return number.replace(/[xX#*_]/g, () => CYCLE.charAt(next++ % CYCLE.length))
    })
  const literals = [...field.pattern.replace(NOT_LITERAL, ' ').matchAll(/(?:\\\+|\+)?[0-9]+/g)]
    .map(([literal]) => literal.replace('\\+', '+'))
    .slice(0, 5)
  const generated = ['', '+', ...literals].flatMap((prefix) =>
    LENGTHS.map((length) => `${prefix}${FILL.slice(0, length)}`),
  )
  return [...new Set([...fromPlaceholder, ...generated])]
}

/** Western digits for Arabic-Indic and Persian ones, so a placeholder can give the example. */
function westernDigits(text: string): string {
  return text.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (digit) => {
    const code = digit.charCodeAt(0)
    return String(code - (code >= 0x6f0 ? 0x6f0 : 0x660))
  })
}

function eastern(value: string): string {
  return value.replace(/[0-9]/g, (digit) => String.fromCharCode(0x660 + Number(digit)))
}
