import { INFO, dialOf, internationalNumbers, type Country, type Reading } from './country'

/**
 * The Gulf pack of the country-fit rule (docs/design/plans/m7-deep-arabic.md): what a page for one
 * of the Gulf Cooperation Council's six states is expected to get right beyond currency and country
 * code. Each check judges only what the page shows, and leaves the rest `unknown`.
 */
export type GulfCountry = 'SA' | 'AE' | 'KW' | 'QA' | 'BH' | 'OM'
export const GULF: readonly GulfCountry[] = ['SA', 'AE', 'KW', 'QA', 'BH', 'OM']
export const isGulf = (country: Country): country is GulfCountry =>
  (GULF as readonly Country[]).includes(country)

/**
 * The value-added tax rate each state that charges one levies, in percent (Saudi Arabia 15 since July
 * 2020, the UAE 5, Bahrain 10 since 2022, Oman 5). Kuwait and Qatar charge none.
 */
export const VAT_RATES: Readonly<Partial<Record<Country, number>>> = {
  SA: 15,
  AE: 5,
  BH: 10,
  OM: 5,
}

/**
 * The days a business of the country rests on: Friday and Saturday in Saudi Arabia, Kuwait, Qatar,
 * Oman and Bahrain. The UAE moved to Saturday and Sunday in 2022 and its businesses differ, so no
 * pattern is expected of it.
 */
export const FRIDAY_SATURDAY: readonly Country[] = ['SA', 'KW', 'QA', 'OM', 'BH']

/** Digits of a national number, trunk 0 left off, that a number of the country has: mobile and fixed. */
export const NATIONAL_LENGTHS: Readonly<Record<GulfCountry, readonly number[]>> = {
  SA: [9],
  AE: [8, 9],
  KW: [8],
  QA: [8],
  BH: [8],
  OM: [8],
}

const toLatin = (text: string): string =>
  text.replace(/[٠-٩]/gu, (digit) => String(digit.charCodeAt(0) - 0x660))

const VAT_WORDS = '(?:ضريبة\\s+القيمة\\s+المضافة|ضريبة\\s+المبيعات|VAT|value[- ]added\\s+tax)'
const PERCENT = '(\\d{1,2}(?:[.,]\\d{1,2})?)\\s*(?:%|٪|بالمئة|بالمائة|في\\s+المئة|percent)'
/** The tax rate a sentence gives beside the words for VAT, within a few words of each other. */
const VAT_THEN = new RegExp(`${VAT_WORDS}[^.\\n\\d]{0,40}${PERCENT}`, 'giu')
const PERCENT_THEN = new RegExp(`${PERCENT}[^.\\n\\d]{0,40}${VAT_WORDS}`, 'giu')

/** The tax rates the page says, in percent. */
export function statedVatRates(text: string): number[] {
  const plain = toLatin(text)
  const rates = new Set<number>()
  for (const match of plain.matchAll(VAT_THEN))
    rates.add(Number((match[1] ?? '').replace(',', '.')))
  for (const match of plain.matchAll(PERCENT_THEN))
    rates.add(Number((match[1] ?? '').replace(',', '.')))
  return [...rates].filter((rate) => Number.isFinite(rate))
}

export interface GulfItem {
  readonly id: 'vat-rate' | 'weekend' | 'phone-shape'
  readonly status: 'ok' | 'gap' | 'unknown'
  readonly detail: string
}

/** The VAT rate the page states against the country's: a page that states another rate is a gap. */
export function vatRateItem(reading: Reading, country: Country): GulfItem | null {
  const expected = VAT_RATES[country]
  if (expected === undefined) return null
  const stated = statedVatRates(reading.text)
  if (stated.length === 0) return { id: 'vat-rate', status: 'unknown', detail: '' }
  if (stated.includes(expected))
    return { id: 'vat-rate', status: 'ok', detail: `${String(expected)}%` }
  return { id: 'vat-rate', status: 'gap', detail: `${String(stated[0])}%` }
}

const DAY_NAMES: readonly (readonly string[])[] = [
  ['الأحد', 'الاحد', 'Sunday', 'Sun'],
  ['الاثنين', 'الإثنين', 'الأثنين', 'Monday', 'Mon'],
  ['الثلاثاء', 'Tuesday', 'Tue'],
  ['الأربعاء', 'الاربعاء', 'Wednesday', 'Wed'],
  ['الخميس', 'Thursday', 'Thu'],
  ['الجمعة', 'Friday', 'Fri'],
  ['السبت', 'Saturday', 'Sat'],
]
const DAY_PATTERN = DAY_NAMES.flat()
  .sort((a, b) => b.length - a.length)
  .join('|')
const DAY = new RegExp(`(?<![\\p{L}])(${DAY_PATTERN})(?![\\p{L}])`, 'giu')
const CLOSED = /مغلق|مغلقة|إجازة|اجازة|عطلة|closed|day off/iu
const RANGE = new RegExp(
  `(?:من\\s+|from\\s+)?(?<![\\p{L}])(${DAY_PATTERN})\\s*(?:إلى|الى|حتى|لغاية|to|until|[-–—])\\s*(?<![\\p{L}])(${DAY_PATTERN})(?![\\p{L}])`,
  'giu',
)

const dayOf = (name: string): number =>
  DAY_NAMES.findIndex((names) =>
    names.some((candidate) => candidate.toLowerCase() === name.toLowerCase()),
  )

/** The days a range names, wrapping the week: Sunday to Thursday is 0 to 4, Saturday to Wednesday 6, 0, 1, 2, 3. */
function span(from: number, to: number): number[] {
  const days: number[] = []
  for (let day = from; ; day = (day + 1) % 7) {
    days.push(day)
    if (day === to) break
  }
  return days
}

/**
 * The weekend in opening hours, for a country that rests on Friday and Saturday. «مغلق يوم الأحد» or
 * «من الاثنين إلى الجمعة» is a Western week (closed on Sunday, open on Friday): a gap; «من الأحد إلى
 * الخميس» or a Friday that is closed is the Gulf's. A page that names no closed day or working week
 * is not judged.
 */
export function weekendItem(reading: Reading, country: Country): GulfItem | null {
  if (!FRIDAY_SATURDAY.includes(country)) return null
  const closed = new Set<number>()
  const open = new Set<number>()
  for (const line of reading.text.split('\n')) {
    if (line.length > 400) continue
    if (CLOSED.test(line)) {
      for (const match of line.matchAll(DAY)) closed.add(dayOf(match[1] ?? ''))
    }
    for (const match of line.matchAll(RANGE)) {
      const from = dayOf(match[1] ?? '')
      const to = dayOf(match[2] ?? '')
      if (from >= 0 && to >= 0 && !CLOSED.test(line))
        for (const day of span(from, to)) open.add(day)
    }
  }
  const unknown: GulfItem = { id: 'weekend', status: 'unknown', detail: '' }
  if (closed.size === 0 && open.size === 0) return unknown
  // A Friday that is closed, or a working week that rests on Friday and Saturday: the Gulf's.
  if (closed.has(5) || (open.size > 0 && !open.has(5) && open.has(0))) {
    return { id: 'weekend', status: 'ok', detail: closed.has(5) ? 'الجمعة' : '' }
  }
  // A Sunday that is closed or a week that works on Friday and rests on Sunday: the Western week.
  if ((closed.has(0) && !closed.has(5)) || (open.size > 0 && open.has(5) && !open.has(0))) {
    return { id: 'weekend', status: 'gap', detail: closed.has(0) ? 'الأحد' : 'الجمعة' }
  }
  return unknown
}

/** A number with the country's own code: its national part has the digits the country's has, and no trunk 0. */
export function phoneShapeItem(reading: Reading, country: Country): GulfItem | null {
  if (!isGulf(country)) return null
  const dial = INFO[country].dial
  const own = internationalNumbers(reading).filter((number) => dialOf(number) === country)
  if (own.length === 0) return { id: 'phone-shape', status: 'unknown', detail: '' }
  for (const number of own) {
    const digits = number.replace(/\D/g, '').replace(/^00/, '')
    const national = digits.slice(dial.length)
    if (national.startsWith('0')) return { id: 'phone-shape', status: 'gap', detail: number.trim() }
    if (!NATIONAL_LENGTHS[country].includes(national.length)) {
      return { id: 'phone-shape', status: 'gap', detail: number.trim() }
    }
  }
  return { id: 'phone-shape', status: 'ok', detail: own[0]?.trim() ?? '' }
}

/** The Gulf pack's items for a country, in report order. */
export function gulfItems(reading: Reading, country: Country): GulfItem[] {
  return [
    vatRateItem(reading, country),
    weekendItem(reading, country),
    phoneShapeItem(reading, country),
  ].filter((item): item is GulfItem => item !== null)
}
