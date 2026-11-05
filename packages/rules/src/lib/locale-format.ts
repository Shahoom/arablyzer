// How a Gulf page writes what has a local form (M10.1): the currency of a price, a date's month,
// the marks inside a number. The rules judge one thing: a page that writes the same thing two ways.

const DIGIT = '[0-9٠-٩۰-۹]'
const AMOUNT = `${DIGIT}+(?:[.,٫٬]${DIGIT}+)*`
/** Spaces and directional marks may stand between a number and its currency. */
const GAP = '[\\s ‎‏‪-‮⁦-⁩]{0,3}'

/**
 * A text without what it quotes: «ر.س 50» between guillemets or curly quotes is an example a page
 * talks about, not a figure it states, so the rules about how a page writes its own figures leave it.
 */
export function unquoted(text: string): string {
  return text.replace(/«[^»]{0,120}»|“[^”]{0,120}”/gu, ' ')
}

export interface CurrencyForm {
  readonly form: string
  readonly pattern: string
}
export interface Currency {
  readonly code: string
  readonly forms: readonly CurrencyForm[]
}

/** An Arabic abbreviation is a whole word of its own; a Latin one touches no other Latin letter. */
const arabic = (pattern: string) => `(?<!\\p{L})${pattern}(?!\\p{L})`
const latin = (pattern: string) => `(?<![A-Za-z])${pattern}(?![A-Za-z])`

/**
 * The currencies of the Gulf and Egypt, and the forms a price is written in. A word that is more
 * than one country's («ريال» alone is Saudi, Omani and Qatari) is not a form of any.
 */
export const CURRENCIES: readonly Currency[] = [
  {
    code: 'SAR',
    forms: [
      { form: 'ر.س', pattern: arabic('ر\\.\\s?س\\.?') },
      { form: 'SAR', pattern: latin('SAR') },
      { form: 'SR', pattern: latin('SR') },
      { form: 'ريال سعودي', pattern: arabic('ريال(?:ا|ات)? سعودي(?:ا|ة)?') },
      { form: '﷼', pattern: '﷼' },
      { form: '⃁', pattern: '⃁' },
    ],
  },
  {
    code: 'AED',
    forms: [
      { form: 'د.إ', pattern: arabic('د\\.\\s?[إا]\\.?') },
      { form: 'AED', pattern: latin('AED') },
      { form: 'درهم إماراتي', pattern: arabic('درهم(?:ا)? إماراتي(?:ا)?') },
    ],
  },
  {
    code: 'OMR',
    forms: [
      { form: 'ر.ع', pattern: arabic('ر\\.\\s?ع\\.?') },
      { form: 'OMR', pattern: latin('OMR') },
      { form: 'RO', pattern: latin('R\\.?O\\.?') },
      { form: 'ريال عماني', pattern: arabic('ريال(?:ا)? عماني(?:ا)?') },
    ],
  },
  {
    code: 'KWD',
    forms: [
      { form: 'د.ك', pattern: arabic('د\\.\\s?ك\\.?') },
      { form: 'KWD', pattern: latin('KWD') },
      { form: 'KD', pattern: latin('K\\.?D\\.?') },
      { form: 'دينار كويتي', pattern: arabic('دينار(?:ا)? كويتي(?:ا)?') },
    ],
  },
  {
    code: 'BHD',
    forms: [
      { form: 'د.ب', pattern: arabic('د\\.\\s?ب\\.?') },
      { form: 'BHD', pattern: latin('BHD') },
      { form: 'BD', pattern: latin('B\\.?D\\.?') },
      { form: 'دينار بحريني', pattern: arabic('دينار(?:ا)? بحريني(?:ا)?') },
    ],
  },
  {
    code: 'QAR',
    forms: [
      { form: 'ر.ق', pattern: arabic('ر\\.\\s?ق\\.?') },
      { form: 'QAR', pattern: latin('QAR') },
      { form: 'QR', pattern: latin('Q\\.?R\\.?') },
      { form: 'ريال قطري', pattern: arabic('ريال(?:ا)? قطري(?:ا)?') },
    ],
  },
  {
    code: 'EGP',
    forms: [
      { form: 'ج.م', pattern: arabic('ج\\.\\s?م\\.?') },
      { form: 'EGP', pattern: latin('EGP') },
      { form: 'LE', pattern: latin('L\\.?E\\.?') },
      { form: 'جنيه مصري', pattern: arabic('جنيه(?:ا)? مصري(?:ا)?') },
    ],
  },
]

const COMPILED = CURRENCIES.map((currency) => ({
  code: currency.code,
  forms: currency.forms.map(({ form, pattern }) => ({
    form,
    // The form after a number, or before it.
    re: new RegExp(`(?:${AMOUNT}${GAP}(?:${pattern}))|(?:(?:${pattern})${GAP}${AMOUNT})`, 'u'),
  })),
}))

export interface PriceForm {
  readonly code: string
  readonly form: string
  readonly example: string
}

/** The forms in which a text writes a price, for each currency: one entry for each form seen. */
export function currencyForms(text: string): PriceForm[] {
  const found: PriceForm[] = []
  for (const currency of COMPILED) {
    for (const { form, re } of currency.forms) {
      const match = re.exec(text)
      if (match !== null) {
        found.push({ code: currency.code, form, example: match[0].replace(/\s+/g, ' ').trim() })
      }
    }
  }
  return found
}

/** The Arabic month names of the Levant and Iraq (the Syriac months) and of the Gulf and Egypt (the Latin ones). */
const LEVANT =
  'كانون الثاني|كانون الأول|كانون الاول|شباط|آذار|اذار|نيسان|أيار|ايار|حزيران|تموز|آب|أيلول|ايلول|تشرين الأول|تشرين الاول|تشرين الثاني'
const GULF_MONTHS =
  'يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر'

function monthPattern(names: string): RegExp {
  // A month is a month when a day or a year stands next to it, so a verb that spells like one is not.
  return new RegExp(
    `(?:${DIGIT}{1,4}\\s+(?<!\\p{L})(?:${names})(?!\\p{L}))|(?:(?<!\\p{L})(?:${names})(?!\\p{L})\\s+${DIGIT}{1,4})`,
    'u',
  )
}
const LEVANT_RE = monthPattern(LEVANT)
const GULF_RE = monthPattern(GULF_MONTHS)

export interface MonthFamilies {
  readonly levant: string | null
  readonly gulf: string | null
}

/** The first date of each family of month names in a text. */
export function monthFamilies(text: string): MonthFamilies {
  const clean = (match: RegExpExecArray | null) => match?.[0].replace(/\s+/g, ' ').trim() ?? null
  return { levant: clean(LEVANT_RE.exec(text)), gulf: clean(GULF_RE.exec(text)) }
}

const toLatin = (text: string) =>
  text
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))

const ISO_DATE = /(?<![\d./-])\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?!\d|-\d)/
const SLASH_DATE =
  /(?<![\d./-])(?:0?[1-9]|[12]\d|3[01])[/.](?:0?[1-9]|1[0-2])[/.]\d{4}(?!\d|[./-]\d)/

export interface NumericDates {
  readonly iso: string | null
  readonly slash: string | null
}

/** The first date in each of two numeric forms: 2026-03-05 and 05/03/2026. */
export function numericDates(text: string): NumericDates {
  const latinText = toLatin(text)
  return {
    iso: ISO_DATE.exec(latinText)?.[0] ?? null,
    slash: SLASH_DATE.exec(latinText)?.[0] ?? null,
  }
}

/** Arabic decimal and thousands marks between digits: ١٬٢٥٠٫٥٠. */
const ARABIC_MARK = new RegExp(`${DIGIT}[٫٬]${DIGIT}`, 'u')
/** Thousands groups with commas (1,250), or a decimal with a point (12.50), but not 6.4.2 or 05.03.2026. */
const LATIN_MARK = /(?<![\d.,])(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d{1,3})(?!\d)(?![.,]\d)/
/** The Arabic comma between digits, taken for a separator: 1،500. */
const ARABIC_COMMA = new RegExp(`${DIGIT}،${DIGIT}`, 'u')

export interface NumberMarks {
  readonly arabic: string | null
  readonly latin: string | null
  readonly arabicComma: string | null
}

export function numberMarks(text: string): NumberMarks {
  const around = (re: RegExp) => {
    const match = re.exec(text)
    if (match === null) return null
    const start = Math.max(0, match.index - 6)
    return text
      .slice(start, match.index + match[0].length + 6)
      .replace(/\s+/g, ' ')
      .trim()
  }
  const latinMatch = LATIN_MARK.exec(toLatin(text))
  return {
    arabic: around(ARABIC_MARK),
    latin: latinMatch === null ? null : latinMatch[0],
    arabicComma: around(ARABIC_COMMA),
  }
}

/** Postal codes of the Gulf states that have them, as the post of each writes them. */
export const POSTAL_CODES: Readonly<
  Record<string, { readonly pattern: RegExp; readonly digits: string }>
> = {
  SA: { pattern: /^\d{5}(?:-\d{4})?$/, digits: '5' },
  KW: { pattern: /^\d{5}$/, digits: '5' },
  OM: { pattern: /^\d{3}$/, digits: '3' },
  BH: { pattern: /^\d{3,4}$/, digits: '3–4' },
}
