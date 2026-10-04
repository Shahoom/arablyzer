import type { PageFacts } from './page'

/**
 * The spelling-variant search test's pieces that need no network (docs/design/plans/arabic-native.md
 * §2): where a site's search is, which real words of the page to ask for, and the variants of
 * each. The engine asks; the rule judges what came back.
 */

export type SearchVia = 'form' | 'wordpress' | 'platform'

/** A search the scan can ask: the address it is sent to and the parameter that takes the query. */
export interface SearchTarget {
  readonly via: SearchVia
  /** The address without the query parameter, on the page's own origin. */
  readonly url: string
  readonly param: string
}

export const VARIANT_KINDS = [
  'ta-marbuta',
  'alef',
  'ya',
  'tatweel',
  'diacritics',
  'digits',
  'arabizi',
] as const
export type SearchVariantKind = (typeof VARIANT_KINDS)[number]

/** Kinds that count towards "loses N of M": an Arabizi form is shown, but no engine is expected to match it. */
export const COUNTED_KINDS: ReadonlySet<SearchVariantKind> = new Set([
  'ta-marbuta',
  'alef',
  'ya',
  'tatweel',
  'diacritics',
  'digits',
])

export interface SearchQuery {
  /** The word of the page this asks about. */
  readonly word: string
  readonly kind: 'base' | SearchVariantKind
  readonly query: string
}

const SEARCH_PATHS: Readonly<Record<string, { readonly path: string; readonly param: string }>> = {
  wordpress: { path: '/', param: 's' },
  shopify: { path: '/search', param: 'q' },
  salla: { path: '/search', param: 'q' },
  zid: { path: '/search', param: 'q' },
}

const sameOrigin = (a: string, b: string): boolean => {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}

/**
 * The site's search, from the page: a GET form marked as a search (or with a search field) on the
 * page's own origin, else the platform's own search address (`facts.platform`), which is a
 * pattern, not something the page said. Null when there is none to ask: a POST form, one on
 * another site, or a platform with no pattern.
 */
export function findSearch(page: PageFacts, platformId: string | null): SearchTarget | null {
  const forms = page.html?.searchForms ?? []
  const form =
    forms.find((candidate) => candidate.marked && candidate.method === 'get') ??
    forms.find((candidate) => candidate.method === 'get')
  if (form !== undefined && sameOrigin(form.action, page.url)) {
    try {
      const url = new URL(form.action)
      url.searchParams.delete(form.field)
      url.hash = ''
      return { via: 'form', url: url.href, param: form.field }
    } catch {
      // An action the URL parser refuses is no search to ask.
    }
  }
  const known = platformId === null ? undefined : SEARCH_PATHS[platformId]
  if (known === undefined) return null
  try {
    const origin = new URL(page.url).origin
    return {
      via: platformId === 'wordpress' ? 'wordpress' : 'platform',
      url: `${origin}${known.path}`,
      param: known.param,
    }
  } catch {
    return null
  }
}

/** The address a query is asked at: the parameter set to the query, UTF-8 percent-encoded. */
export function searchUrl(target: SearchTarget, query: string): string {
  const url = new URL(target.url)
  url.searchParams.set(target.param, query)
  return url.href
}

const DIACRITICS = /[ً-ٰٟۖ-ۭ]/g
const TATWEEL = /ـ/g
const ARABIC_WORD = /^[ء-غف-يٱ-ۓ]+$/u
/** Letters that do not join to the one after them: a tatweel cannot follow them. */
const NON_JOINING = new Set(Array.from('اأإآدذرزوؤةىء'))
const LATIN_DIGITS = '0123456789'
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

/** Function words that say nothing of a page: a search for one is not a search for the site. */
const STOPWORDS = new Set([
  'هذا',
  'هذه',
  'ذلك',
  'تلك',
  'التي',
  'الذي',
  'الذين',
  'على',
  'إلى',
  'الى',
  'عن',
  'مع',
  'كما',
  'أو',
  'أي',
  'كل',
  'بعد',
  'قبل',
  'عند',
  'حتى',
  'لكن',
  'منذ',
  'بين',
  'أيضا',
  'أيضاً',
  'جميع',
  'لدينا',
  'نحن',
  'هناك',
  'فقط',
  'يمكن',
  'يمكنك',
  'الرئيسية',
  'اتصل',
  'تواصل',
])

/** A word without diacritics and tatweel: how a search should read it. */
export const plainWord = (word: string): string => word.replace(DIACRITICS, '').replace(TATWEEL, '')

/** A letter of a word a variant can change: the word has something to test. */
const VARYING = /[ةهأإآاىي]/u

/**
 * Up to `count` real Arabic words of the page to search for: 4 to 10 letters, not a function word,
 * and with a letter whose spelling varies. Words in headings come first, then by how often the
 * page uses them, then in the order they appear, so the same page gives the same words.
 */
export function pickWords(page: PageFacts, count = 4): string[] {
  const seen = new Map<string, { score: number; order: number }>()
  let order = 0
  const add = (text: string, weight: number) => {
    const spaced = text
      .replaceAll('\u200c', ' ')
      .replaceAll('\u200d', ' ')
      .replaceAll('\u200e', ' ')
      .replaceAll('\u200f', ' ')
    for (const raw of spaced.split(/[\s.,;:!?()[\]{}«»"'،؛؟/\\|\-–—]+/u)) {
      const word = plainWord(raw)
      if (word.length < 4 || word.length > 10 || !ARABIC_WORD.test(word)) continue
      if (STOPWORDS.has(word) || !VARYING.test(word)) continue
      const known = seen.get(word)
      if (known === undefined) seen.set(word, { score: weight, order: order++ })
      else known.score += weight
    }
  }
  for (const heading of page.html?.headings ?? []) add(heading.text, 3)
  for (const segment of page.text?.segments ?? []) if (!segment.code) add(segment.text, 1)
  return [...seen.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[1].order - b[1].order)
    .slice(0, count)
    .map(([word]) => word)
}

/** The numbers of two or more digits the page writes, in either digit set, first seen first. */
export function pickNumbers(page: PageFacts, count = 1): string[] {
  const found: string[] = []
  for (const segment of page.text?.segments ?? []) {
    for (const match of segment.text.matchAll(/[0-9٠-٩]{2,6}/gu)) {
      if (!found.includes(match[0]) && found.length < count) found.push(match[0])
    }
  }
  return found
}

/** The same digits in the other set: Arabic-Indic for Latin, Latin for Arabic-Indic. */
export function otherDigits(number: string): string {
  return Array.from(number, (digit) => {
    const latin = LATIN_DIGITS.indexOf(digit)
    if (latin >= 0) return ARABIC_DIGITS.charAt(latin)
    const arabic = ARABIC_DIGITS.indexOf(digit)
    return arabic >= 0 ? LATIN_DIGITS.charAt(arabic) : digit
  }).join('')
}

const ARABIZI: Readonly<Record<string, string>> = {
  ا: 'a',
  أ: 'a',
  إ: 'e',
  آ: 'a',
  ب: 'b',
  ت: 't',
  ث: 'th',
  ج: 'j',
  ح: '7',
  خ: 'kh',
  د: 'd',
  ذ: 'th',
  ر: 'r',
  ز: 'z',
  س: 's',
  ش: 'sh',
  ص: 's',
  ض: 'd',
  ط: 't',
  ظ: 'z',
  ع: '3',
  غ: 'gh',
  ف: 'f',
  ق: 'q',
  ك: 'k',
  ل: 'l',
  م: 'm',
  ن: 'n',
  ه: 'h',
  ة: 'a',
  و: 'w',
  ي: 'y',
  ى: 'a',
}

/** A chat-alphabet spelling: the consonants as people type them, with no vowels the word does not spell. */
export const arabizi = (word: string): string =>
  Array.from(word, (letter) => ARABIZI[letter] ?? '').join('')

/** The variants of one word, by kind, each different from the word; a kind the word cannot show is left out. */
export function variantsOf(word: string): { kind: SearchVariantKind; query: string }[] {
  const letters = Array.from(word)
  const last = letters.at(-1) ?? ''
  const out: { kind: SearchVariantKind; query: string }[] = []
  const add = (kind: SearchVariantKind, query: string) => {
    if (query !== word && query !== '') out.push({ kind, query })
  }
  if (last === 'ة') add('ta-marbuta', `${letters.slice(0, -1).join('')}ه`)
  else if (last === 'ه') add('ta-marbuta', `${letters.slice(0, -1).join('')}ة`)
  if (/[أإآ]/u.test(word)) add('alef', word.replace(/[أإآ]/gu, 'ا'))
  else {
    // A plain alef after the definite article's, if any: the word with its hamza.
    const start = word.startsWith('ال') ? 2 : 0
    const at = letters.findIndex(
      (letter, i) => i >= start && letter === 'ا' && i < letters.length - 1,
    )
    if (at >= 0) add('alef', letters.map((l, i) => (i === at ? 'أ' : l)).join(''))
  }
  if (word.includes('ى')) add('ya', word.replace(/ى/gu, 'ي'))
  else if (last === 'ي') add('ya', `${letters.slice(0, -1).join('')}ى`)
  const join = letters.findIndex(
    (letter, at) => at >= 1 && at < letters.length - 1 && !NON_JOINING.has(letter),
  )
  if (join >= 0)
    add('tatweel', `${letters.slice(0, join + 1).join('')}ـ${letters.slice(join + 1).join('')}`)
  if (letters.length > 1) add('diacritics', `${letters[0] ?? ''}َ${letters.slice(1).join('')}`)
  add('arabizi', arabizi(word))
  return out
}

/**
 * The queries to ask, in order, within `slots`: each word as the page spells it, then its variants
 * taken in turn across the words, so every word is tried before any is tried twice; the last
 * slot is one Arabizi form, from the word that has letters people type as digits (ع ح خ ق).
 */
export function planQueries(
  words: readonly string[],
  numbers: readonly string[],
  slots: number,
): SearchQuery[] {
  const bases: SearchQuery[] = [...words, ...numbers].map((word) => ({
    word,
    kind: 'base',
    query: word,
  }))
  const variants = words.map((word) => variantsOf(word).filter((v) => v.kind !== 'arabizi'))
  const rest: SearchQuery[] = numbers.map((number) => ({
    word: number,
    kind: 'digits',
    query: otherDigits(number),
  }))
  for (let round = 0; round < VARIANT_KINDS.length; round++) {
    for (const [index, word] of words.entries()) {
      const variant = variants[index]?.[round]
      if (variant !== undefined) rest.push({ word, kind: variant.kind, query: variant.query })
    }
  }
  const chat = words
    .toSorted((a, b) => Number(/[عحخق]/u.test(b)) - Number(/[عحخق]/u.test(a)))
    .map((word): SearchQuery => ({ word, kind: 'arabizi', query: arabizi(word) }))
    .find((query) => query.query !== '')
  const room = Math.max(0, slots - bases.length - (chat === undefined ? 0 : 1))
  return [
    ...bases,
    ...rest.filter((query) => query.query !== query.word).slice(0, room),
    ...(chat === undefined || slots <= bases.length ? [] : [chat]),
  ]
}

/** What the search returned for one query. */
export interface SearchProbe {
  readonly query: string
  /** The HTTP status; null when the request failed. */
  readonly status: number | null
  /** The distinct links on the answer that the page of a query nobody could match does not have; null without an answer. */
  readonly results: number | null
  /** The first of them, as a path; null when there is none. */
  readonly first: string | null
}

export interface SearchVariantResult extends SearchProbe {
  readonly kind: SearchVariantKind
  /** Whether it counts towards the total: an Arabizi form never does. */
  readonly counted: boolean
  /** Against the word's own spelling: the same results, others, or too few to be the same search. */
  readonly outcome: 'same' | 'differs' | 'lost' | 'unanswered'
}

export interface SearchWordResult {
  readonly word: string
  readonly base: SearchProbe
  readonly variants: readonly SearchVariantResult[]
}

export type SearchFacts =
  | { readonly outcome: 'not-found' }
  /** A search was found, but the page has no word of its own to ask it for. */
  | { readonly outcome: 'no-words'; readonly via: SearchVia; readonly url: string }
  /** robots.txt keeps the bot from the search: nothing was asked. */
  | { readonly outcome: 'robots'; readonly via: SearchVia; readonly url: string }
  /** Asked, but no answer could be read as a search (the nonsense query was refused or broke). */
  | { readonly outcome: 'unreachable'; readonly via: SearchVia; readonly url: string }
  | {
      readonly outcome: 'tested'
      readonly via: SearchVia
      readonly url: string
      readonly param: string
      /** Requests made, the baseline included. */
      readonly requests: number
      readonly words: readonly SearchWordResult[]
    }

/** How a variant's answer compares with the word's own: same first result and count, fewer than half, or others. */
export function compareProbe(
  base: SearchProbe,
  variant: SearchProbe,
): SearchVariantResult['outcome'] {
  if (variant.results === null || base.results === null) return 'unanswered'
  // A word its own spelling found nothing for says nothing of its variants.
  if (base.results === 0) return variant.results === 0 ? 'same' : 'differs'
  if (variant.results === 0 || variant.results < base.results / 2) return 'lost'
  return variant.results === base.results && variant.first === base.first ? 'same' : 'differs'
}

/** How many variants were tested and how many lost, over the words whose own spelling found something. */
export function lossOf(words: readonly SearchWordResult[]): { lost: number; total: number } {
  let lost = 0
  let total = 0
  for (const word of words) {
    if ((word.base.results ?? 0) === 0) continue
    for (const variant of word.variants) {
      if (!variant.counted || variant.outcome === 'unanswered') continue
      total++
      if (variant.outcome === 'lost') lost++
    }
  }
  return { lost, total }
}
