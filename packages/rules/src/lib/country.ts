import type { PageFacts } from '@arablyzer/collectors'

/** The countries whose fit the rule judges, by ISO 3166-1 alpha-2. */
export const COUNTRIES = ['SA', 'AE', 'EG', 'KW', 'QA', 'BH', 'OM', 'JO', 'MA'] as const
export type Country = (typeof COUNTRIES)[number]

export interface CountryInfo {
  readonly currency: string
  /** Latin abbreviations, which may not touch another Latin letter. */
  readonly latin: string
  /** Arabic abbreviations and full names that say which country's money it is. */
  readonly arabic: string
  /** The calling code, digits only. */
  readonly dial: string
  /** National mobile numbers without the trunk prefix, as a pattern of digits. */
  readonly local: string
  /** Numbers are written with a leading 0 inside the country (05…): a number so written has no country code. */
  readonly trunk: boolean
  /** Prices are expected to say whether they include value-added tax (Saudi Arabia and the UAE). */
  readonly vat: boolean
  /** The Hijri calendar is shown beside the Gregorian on official and news pages. */
  readonly hijri: boolean
  /** Readers expect Latin digits (the Maghreb); others read both. */
  readonly latinDigits: boolean
}

export const INFO: Readonly<Record<Country, CountryInfo>> = {
  SA: {
    currency: 'SAR',
    latin: 'SAR|SR|S\\.R\\.?',
    arabic: `ر\\.\\s?س\\.?|ريال(?:اً|ًا|ا|ات)? سعودي(?:اً|ًا|ا|ة)?|⃁`,
    dial: '966',
    local: '5\\d{8}',
    trunk: true,
    vat: true,
    hijri: true,
    latinDigits: false,
  },
  AE: {
    currency: 'AED',
    latin: 'AED|Dhs?\\.?',
    arabic: `د\\.\\s?إ\\.?|درهم(?:اً|ًا|ا)? إماراتي(?:اً|ًا|ا)?|دراهم إماراتية`,
    dial: '971',
    local: '5\\d{8}',
    trunk: true,
    vat: true,
    hijri: false,
    latinDigits: false,
  },
  EG: {
    currency: 'EGP',
    latin: 'EGP|L\\.?E\\.?',
    arabic: `ج\\.\\s?م\\.?|جنيه(?:اً|ًا|ا)? مصري(?:اً|ًا|ا)?|جنيهات مصرية`,
    dial: '20',
    local: '1[0125]\\d{8}',
    trunk: true,
    vat: false,
    hijri: false,
    latinDigits: false,
  },
  KW: {
    currency: 'KWD',
    latin: 'KWD|K\\.?D\\.?',
    arabic: `د\\.\\s?ك\\.?|دينار(?:اً|ًا|ا)? كويتي(?:اً|ًا|ا)?|دنانير كويتية`,
    dial: '965',
    local: '[569]\\d{7}',
    trunk: false,
    vat: false,
    hijri: false,
    latinDigits: false,
  },
  QA: {
    currency: 'QAR',
    latin: 'QAR|QR',
    arabic: `ر\\.\\s?ق\\.?|ريال(?:اً|ًا|ا|ات)? قطري(?:اً|ًا|ا|ة)?`,
    dial: '974',
    local: '[3567]\\d{7}',
    trunk: false,
    vat: false,
    hijri: false,
    latinDigits: false,
  },
  BH: {
    currency: 'BHD',
    latin: 'BHD|B\\.?D\\.?',
    arabic: `د\\.\\s?ب\\.?|دينار(?:اً|ًا|ا)? بحريني(?:اً|ًا|ا)?|دنانير بحرينية`,
    dial: '973',
    local: '[36]\\d{7}',
    trunk: false,
    vat: false,
    hijri: false,
    latinDigits: false,
  },
  OM: {
    currency: 'OMR',
    latin: 'OMR|R\\.?O\\.?',
    arabic: `ر\\.\\s?ع\\.?|ريال(?:اً|ًا|ا|ات)? عماني(?:اً|ًا|ا|ة)?`,
    dial: '968',
    local: '[79]\\d{7}',
    trunk: false,
    vat: false,
    hijri: false,
    latinDigits: false,
  },
  JO: {
    currency: 'JOD',
    latin: 'JOD|J\\.?D\\.?',
    arabic: `د\\.\\s?أ\\.?|دينار(?:اً|ًا|ا)? أردني(?:اً|ًا|ا)?|دنانير أردنية`,
    dial: '962',
    local: '7[789]\\d{7}',
    trunk: true,
    vat: false,
    hijri: false,
    latinDigits: false,
  },
  MA: {
    currency: 'MAD',
    latin: 'MAD|DH|Dhs?\\.?',
    arabic: `د\\.\\s?م\\.?|درهم(?:اً|ًا|ا)? مغربي(?:اً|ًا|ا)?|دراهم مغربية`,
    dial: '212',
    local: '[67]\\d{8}',
    trunk: true,
    vat: false,
    hijri: false,
    latinDigits: true,
  },
}

/** The ccTLD suffix of each country. */
const TLD: Readonly<Record<string, Country>> = {
  sa: 'SA',
  ae: 'AE',
  eg: 'EG',
  kw: 'KW',
  qa: 'QA',
  bh: 'BH',
  om: 'OM',
  jo: 'JO',
  ma: 'MA',
}

export const NAMES: Readonly<Record<Country, { readonly ar: string; readonly en: string }>> = {
  SA: { ar: 'السعودية', en: 'Saudi Arabia' },
  AE: { ar: 'الإمارات', en: 'the UAE' },
  EG: { ar: 'مصر', en: 'Egypt' },
  KW: { ar: 'الكويت', en: 'Kuwait' },
  QA: { ar: 'قطر', en: 'Qatar' },
  BH: { ar: 'البحرين', en: 'Bahrain' },
  OM: { ar: 'عُمان', en: 'Oman' },
  JO: { ar: 'الأردن', en: 'Jordan' },
  MA: { ar: 'المغرب', en: 'Morocco' },
}

/** The new Saudi Riyal sign (Unicode 17, U+20C1). */
export const SAUDI_RIYAL_SIGN = '⃁'

const GAP = '[\\s‎‏؜⁦-⁩]{0,4}'
const DIGITS = '0-9٠-٩۰-۹'

const currencyRegex = (info: CountryInfo): RegExp =>
  new RegExp(
    `(?:(?<![A-Za-z])(?:${info.latin})(?![A-Za-z])|(?<!\\p{L})(?:${info.arabic})(?!\\p{L}))`,
    'u',
  )
const priceRegex = (info: CountryInfo): RegExp =>
  new RegExp(
    `[${DIGITS}][${DIGITS}.,٫٬]*${GAP}(?:${info.latin.replaceAll('|', '|')}|${info.arabic})(?![A-Za-z\\p{L}])|(?:(?<![A-Za-z])(?:${info.latin})|(?<!\\p{L})(?:${info.arabic}))${GAP}[${DIGITS}]`,
    'u',
  )
/** Prices in a currency the rule does not know the country of: dollars, euros, the bare riyal. */
const OTHER_PRICE = new RegExp(
  `[${DIGITS}][${DIGITS}.,]*${GAP}(?:USD|EUR|GBP|\\$|€|£|دولار|يورو)|(?:USD|EUR|GBP|\\$|€|£)${GAP}[${DIGITS}]`,
  'iu',
)

/** What the page says, in the text a visitor reads: its visible segments and its tel: links. */
export interface Reading {
  readonly text: string
  readonly tel: readonly string[]
  readonly host: string
  readonly lang: string | null
  readonly hreflangs: readonly string[]
}

const MAX_TEXT = 400_000

export function readPage(page: PageFacts): Reading {
  const segments = page.text?.segments ?? []
  let text = ''
  for (const segment of segments) {
    if (segment.code) continue
    if (text.length > MAX_TEXT) break
    text += `${segment.text}\n`
  }
  const tel = (page.html?.anchors ?? []).flatMap((anchor) =>
    /^tel:/i.test(anchor.href) ? [decodeURIComponent(anchor.href.slice(4)).trim()] : [],
  )
  const hreflangs = (page.html?.links ?? []).flatMap((link) =>
    link.rel.includes('alternate') && link.hreflang !== null ? [link.hreflang.toLowerCase()] : [],
  )
  let host = ''
  try {
    host = new URL(page.url).hostname.toLowerCase()
  } catch {
    // A page with no usable address has no ccTLD to read.
  }
  return { text, tel, host, lang: page.html?.root.lang ?? null, hreflangs }
}

export interface Signal {
  readonly kind: 'domain' | 'lang' | 'hreflang' | 'currency' | 'phone'
  readonly country: Country
  /** What was seen. */
  readonly value: string
}

const SIGNAL_WEIGHT: Readonly<Record<Signal['kind'], number>> = {
  domain: 3,
  lang: 3,
  hreflang: 2,
  currency: 3,
  phone: 2,
}

/** The region of a language tag (`ar-SA` → SA) when it is one of the countries; null otherwise. */
export function regionOf(tag: string): Country | null {
  const region = /^[a-z]{2,3}[-_]([a-z]{2})(?:[-_]|$)/i.exec(tag)?.[1]?.toUpperCase()
  return COUNTRIES.find((country) => country === region) ?? null
}

const asLatinDigits = (text: string): string =>
  Array.from(text, (char) => {
    const code = char.charCodeAt(0)
    if (code >= 0x660 && code <= 0x669) return String(code - 0x660)
    if (code >= 0x6f0 && code <= 0x6f9) return String(code - 0x6f0)
    return char
  }).join('')

/** The country whose calling code a number starts with (+966…, 00971…); null for any other. */
export function dialOf(number: string): Country | null {
  const plain = asLatinDigits(number).replace(/[\s().-]/g, '')
  const digits = /^(?:\+|00)([0-9]+)$/.exec(plain)?.[1]
  if (digits === undefined) return null
  return (
    [...COUNTRIES]
      .sort((a, b) => INFO[b].dial.length - INFO[a].dial.length)
      .find((country) => digits.startsWith(INFO[country].dial)) ?? null
  )
}

/** International numbers the text holds: +966 5…, 00971 …, with separators. */
const INTERNATIONAL = /(?:^|[^0-9٠-٩])((?:\+|00)[0-9٠-٩][0-9٠-٩\s().-]{6,16}[0-9٠-٩])/gu

export function internationalNumbers(reading: Reading): string[] {
  const numbers = [...reading.tel.filter((tel) => /^(?:\+|00)/.test(tel))]
  for (const match of reading.text.matchAll(INTERNATIONAL)) numbers.push(match[1] ?? '')
  return numbers.map(asLatinDigits)
}

/** National numbers without a country code (05…, 01…, 07…), as the country writes them. */
export function localNumbers(reading: Reading, country: Country): string[] {
  const info = INFO[country]
  // Without a trunk 0 a national number looks like any other digits: none is claimed.
  if (!info.trunk) return []
  const pattern = new RegExp(`(?<![0-9+])0(?:${info.local})(?![0-9])`, 'gu')
  const text = asLatinDigits(`${reading.text}\n${reading.tel.join('\n')}`).replace(/[\s-]/g, '')
  return [...text.matchAll(pattern)].map((match) => match[0])
}

/** The evidence that says which country a page is for: what it said, each of its own kind. */
export function signalsOf(reading: Reading): Signal[] {
  const found: Signal[] = []
  const suffix = reading.host.split('.').at(-1) ?? ''
  const domain = TLD[suffix]
  if (domain !== undefined) found.push({ kind: 'domain', country: domain, value: `.${suffix}` })
  if (reading.lang !== null) {
    const region = regionOf(reading.lang)
    if (region !== null) found.push({ kind: 'lang', country: region, value: reading.lang })
  }
  const regions = new Set<Country>()
  for (const tag of reading.hreflangs) {
    const region = regionOf(tag)
    if (region !== null) regions.add(region)
  }
  // A page that names several countries in hreflang is one page of several; one that names a
  // single country (besides x-default and plain languages) says which it is.
  if (regions.size === 1) {
    const [only] = [...regions]
    if (only !== undefined) found.push({ kind: 'hreflang', country: only, value: 'hreflang' })
  }
  for (const country of COUNTRIES) {
    const match = currencyRegex(INFO[country]).exec(reading.text)
    if (match !== null) found.push({ kind: 'currency', country, value: match[0].trim() })
  }
  const dialed = new Map<Country, string>()
  for (const number of internationalNumbers(reading)) {
    const country = dialOf(number)
    if (country !== null && !dialed.has(country)) dialed.set(country, number.trim())
  }
  for (const [country, value] of dialed) found.push({ kind: 'phone', country, value })
  return found
}

export type Confidence = 'strong' | 'thin' | 'unclear'

export interface Inference {
  readonly country: Country | null
  readonly confidence: Confidence
  readonly signals: readonly Signal[]
}

/**
 * Which country a page is for, from what it says (signalsOf). One country counts as the page's
 * only when its evidence is at least two signals of different kinds and out-weighs every other
 * country's by two; one signal alone is `thin`, and countries that tie or contradict are
 * `unclear`. Nothing is guessed: with `thin` or `unclear` there is no percentage.
 */
export function inferCountry(reading: Reading): Inference {
  const signals = signalsOf(reading)
  const score = new Map<Country, number>()
  const kinds = new Map<Country, Set<Signal['kind']>>()
  for (const signal of signals) {
    score.set(signal.country, (score.get(signal.country) ?? 0) + SIGNAL_WEIGHT[signal.kind])
    const set = kinds.get(signal.country) ?? new Set<Signal['kind']>()
    set.add(signal.kind)
    kinds.set(signal.country, set)
  }
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1])
  const [top, second] = ranked
  if (top === undefined) return { country: null, confidence: 'unclear', signals }
  const [country, best] = top
  if (second !== undefined && best - second[1] < 2) {
    return { country: null, confidence: 'unclear', signals }
  }
  const strong = (kinds.get(country)?.size ?? 0) >= 2 && best >= 4
  return { country, confidence: strong ? 'strong' : 'thin', signals }
}

export type ItemId = 'currency' | 'phone' | 'digits' | 'vat' | 'hijri' | 'lang'

export interface Item {
  readonly id: ItemId
  readonly status: 'ok' | 'gap' | 'unknown'
  /** What was seen, for the report. */
  readonly detail: string
  /** A phone gap: a national number with no country code, or a number with another country's. */
  readonly variant?: 'local' | 'foreign'
}

const HIJRI_MONTHS =
  /محرم|صفر|ربيع الأول|ربيع الآخر|ربيع الثاني|جمادى الأولى|جمادى الآخرة|جمادى الثانية|رجب|شعبان|رمضان|شوال|ذو القعدة|ذي القعدة|ذو الحجة|ذي الحجة|\d\s*هـ|هـ\s*\d/u
const DATE =
  /(?:[0-9٠-٩]{1,2}[/.-][0-9٠-٩]{1,2}[/.-][0-9٠-٩]{4})|(?:[0-9٠-٩]{1,2}\s+(?:يناير|فبراير|مارس|أبريل|إبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر))/u
const TAX =
  /ضريبة القيمة المضافة|شامل (?:ال)?ضريبة|غير شامل (?:ال)?ضريبة|الرقم الضريبي|\bVAT\b|\bTRN\b|\btax(?:es)?\b/iu

/** Whether the page shows prices at all, in a currency the rule knows or in dollars and euros. */
function showsPrices(text: string): boolean {
  return COUNTRIES.some((country) => priceRegex(INFO[country]).test(text)) || OTHER_PRICE.test(text)
}

/**
 * The items of a country's fit, each `ok`, a `gap`, or `unknown` where the page shows nothing to
 * judge (no prices, no dates, no phone numbers): an unknown item is never counted either way.
 */
export function itemsFor(reading: Reading, country: Country): Item[] {
  const info = INFO[country]
  const items: Item[] = []
  const text = reading.text

  // Currency: prices in the country's own money.
  const own = priceRegex(info).exec(text)
  if (own !== null) items.push({ id: 'currency', status: 'ok', detail: own[0].trim() })
  else if (showsPrices(text)) {
    const other = COUNTRIES.filter((c) => c !== country).find((c) => priceRegex(INFO[c]).test(text))
    items.push({
      id: 'currency',
      status: 'gap',
      detail: other === undefined ? 'USD/EUR' : INFO[other].currency,
    })
  } else items.push({ id: 'currency', status: 'unknown', detail: '' })

  // Phone: numbers with the country's calling code, against numbers written without one.
  const dialed = internationalNumbers(reading)
  const ours = dialed.find((number) => dialOf(number) === country)
  const foreign = dialed.find((number) => dialOf(number) !== null && dialOf(number) !== country)
  const local = localNumbers(reading, country)[0]
  if (ours !== undefined && local === undefined) {
    items.push({ id: 'phone', status: 'ok', detail: ours.trim() })
  } else if (local !== undefined) {
    items.push({ id: 'phone', status: 'gap', detail: local, variant: 'local' })
  } else if (foreign !== undefined) {
    items.push({ id: 'phone', status: 'gap', detail: foreign.trim(), variant: 'foreign' })
  } else items.push({ id: 'phone', status: 'unknown', detail: '' })

  // Digits: the Maghreb reads Latin digits; the Gulf and Egypt read both, so nothing is expected.
  const arabicDigits = text.match(/[٠-٩]/gu)?.length ?? 0
  if (info.latinDigits) {
    items.push(
      arabicDigits > 0
        ? { id: 'digits', status: 'gap', detail: String(arabicDigits) }
        : { id: 'digits', status: 'ok', detail: '' },
    )
  } else items.push({ id: 'digits', status: 'unknown', detail: '' })

  // VAT, where the country charges it: a price page says whether prices include it.
  if (info.vat) {
    if (TAX.test(text)) items.push({ id: 'vat', status: 'ok', detail: '' })
    else if (showsPrices(text)) items.push({ id: 'vat', status: 'gap', detail: '' })
    else items.push({ id: 'vat', status: 'unknown', detail: '' })
  }

  // Hijri date, where the country shows it beside the Gregorian: judged only on a page with dates.
  if (info.hijri) {
    const hijri = HIJRI_MONTHS.exec(text)
    if (hijri !== null) items.push({ id: 'hijri', status: 'ok', detail: hijri[0].trim() })
    else if (DATE.test(text)) items.push({ id: 'hijri', status: 'gap', detail: '' })
    else items.push({ id: 'hijri', status: 'unknown', detail: '' })
  }

  // The language tag's region, where it names one.
  const region = reading.lang === null ? null : regionOf(reading.lang)
  items.push(
    region === null
      ? { id: 'lang', status: 'unknown', detail: reading.lang ?? '' }
      : { id: 'lang', status: region === country ? 'ok' : 'gap', detail: reading.lang ?? '' },
  )
  return items
}

/** Items judged `ok` over those judged at all, as a whole percentage; null with fewer than 3 judged. */
export function readiness(items: readonly Item[]): { percent: number | null; judged: number } {
  const judged = items.filter((item) => item.status !== 'unknown')
  if (judged.length < 3) return { percent: null, judged: judged.length }
  const ok = judged.filter((item) => item.status === 'ok').length
  return { percent: Math.round((ok / judged.length) * 100), judged: judged.length }
}

/** The whole fit of a page: the inferred country, its items and its readiness. */
export interface Fit extends Inference {
  readonly items: readonly Item[]
  readonly percent: number | null
  readonly judged: number
}

export function fitOf(page: PageFacts): Fit {
  const reading = readPage(page)
  const inference = inferCountry(reading)
  if (inference.country === null) return { ...inference, items: [], percent: null, judged: 0 }
  const items = itemsFor(reading, inference.country)
  const { percent, judged } = readiness(items)
  return {
    ...inference,
    items,
    percent: inference.confidence === 'strong' ? percent : null,
    judged,
  }
}
