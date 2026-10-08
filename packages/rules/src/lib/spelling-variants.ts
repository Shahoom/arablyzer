import type { PageFacts } from '@arablyzer/collectors'
import { ARABIC_MARKS, nameKey } from './ar-normalize'

/**
 * The common misspellings of an Arabic word, and the key terms of a page to make them for
 * (docs/design/plans/arabic-native.md §12). Pure: which of them people really type is asked of a
 * search engine's suggestions (engine/src/suggest.ts), and which the page writes is read here.
 */
export type SpellingKind = 'ta-marbuta' | 'hamza' | 'ya' | 'arabizi' | 'drop' | 'swap'

/** The order variants are asked in when the budget is short: the likeliest slips first. */
export const KIND_ORDER: readonly SpellingKind[] = [
  'ta-marbuta',
  'hamza',
  'ya',
  'arabizi',
  'drop',
  'swap',
]

export interface Spelling {
  readonly text: string
  readonly kind: SpellingKind
}

const HAMZA_ALEFS = /[أإآ]/gu
const MATRES = new Set(['ا', 'و', 'ي'])

/** Arabizi: the letters Arabic speakers type in Latin script, with the digits for the sounds Latin lacks. */
const ARABIZI_LETTERS: Readonly<Record<string, readonly [string, string]>> = {
  ا: ['a', 'a'],
  أ: ['a', '2'],
  إ: ['e', '2'],
  آ: ['a', '2'],
  ء: ['a', '2'],
  ب: ['b', 'b'],
  ت: ['t', 't'],
  ث: ['th', 'th'],
  ج: ['j', 'j'],
  ح: ['h', '7'],
  خ: ['kh', '5'],
  د: ['d', 'd'],
  ذ: ['th', 'th'],
  ر: ['r', 'r'],
  ز: ['z', 'z'],
  س: ['s', 's'],
  ش: ['sh', 'sh'],
  ص: ['s', '9'],
  ض: ['d', '9'],
  ط: ['t', '6'],
  ظ: ['z', '6'],
  ع: ['a', '3'],
  غ: ['gh', '3'],
  ف: ['f', 'f'],
  ق: ['q', '9'],
  ك: ['k', 'k'],
  ل: ['l', 'l'],
  م: ['m', 'm'],
  ن: ['n', 'n'],
  ه: ['h', 'h'],
  ة: ['a', 'a'],
  و: ['o', 'o'],
  ي: ['i', 'i'],
  ى: ['a', 'a'],
  ؤ: ['o', '2'],
  ئ: ['i', '2'],
}

/** The word with its marks and tatweel taken off, as people type it. */
export function bareWord(word: string): string {
  return word.replace(ARABIC_MARKS, '').replace(/ـ/gu, '')
}

/** The Arabic words of a text, as written (hamza forms kept), without marks. */
export function writtenWords(text: string): string[] {
  return bareWord(text).match(/[ء-يٱ-ۓ]+/gu) ?? []
}

/** The common misspellings of one word: at most 3 for each kind but the Arabizi's two. */
export function misspellings(word: string): Spelling[] {
  const w = bareWord(word)
  const out: Spelling[] = []
  const seen = new Set<string>([w])
  const add = (text: string, kind: SpellingKind) => {
    if (text.length < 2 || seen.has(text)) return
    seen.add(text)
    out.push({ text, kind })
  }
  const last = w.slice(-1)
  if (last === 'ة') add(`${w.slice(0, -1)}ه`, 'ta-marbuta')
  else if (last === 'ه') add(`${w.slice(0, -1)}ة`, 'ta-marbuta')
  // Hamza: dropped everywhere, put on an initial alef, or moved from أ to إ.
  if (HAMZA_ALEFS.test(w)) add(w.replace(HAMZA_ALEFS, 'ا'), 'hamza')
  HAMZA_ALEFS.lastIndex = 0
  if (w.startsWith('ا') && !w.startsWith('ال')) {
    add(`أ${w.slice(1)}`, 'hamza')
    add(`إ${w.slice(1)}`, 'hamza')
  }
  if (w.includes('أ')) add(w.replace(/أ/u, 'إ'), 'hamza')
  if (last === 'ى') add(`${w.slice(0, -1)}ي`, 'ya')
  else if (last === 'ي') add(`${w.slice(0, -1)}ى`, 'ya')
  // Arabizi: Latin letters, then with the digits.
  const letters = Array.from(w)
  const article = w.startsWith('\u0627\u0644') && letters.length > 3
  const latin = (index: 0 | 1) =>
    `${article ? 'al' : ''}${letters
      .slice(article ? 2 : 0)
      .map((letter) => ARABIZI_LETTERS[letter]?.[index] ?? '')
      .join('')}`
  add(latin(0), 'arabizi')
  add(latin(1), 'arabizi')
  // A letter dropped: a long vowel first, as writers skip them.
  const inner = letters
    .map((letter, at) => ({ letter, at }))
    .filter(({ at }) => at > 0 && at < letters.length - 1)
  const dropOrder = [
    ...inner.filter(({ letter }) => MATRES.has(letter)),
    ...inner.filter(({ letter }) => !MATRES.has(letter)),
  ]
  for (const { at } of dropOrder.slice(0, 3))
    add(letters.filter((_, index) => index !== at).join(''), 'drop')
  // Two inner letters swapped.
  for (
    let at = 1;
    at + 2 < letters.length && out.filter((item) => item.kind === 'swap').length < 2;
    at++
  ) {
    const swapped = [...letters]
    ;[swapped[at], swapped[at + 1]] = [swapped[at + 1] ?? '', swapped[at] ?? '']
    add(swapped.join(''), 'swap')
  }
  return out
}

/** Words that are not a page's subject: a store, a site, "home". */
const GENERIC = new Set(
  'متجر موقع شركة مؤسسة الرئيسية الرئيسيه الصفحة الصفحه اتصل اتصلوا عنا معنا بنا خدماتنا منتجاتنا اهلا أهلا مرحبا بكم لكم هذا هذه التي الذي على الى إلى عن في من مع أو او كل جميع'
    .split(/\s+/)
    .map((word) => nameKey(word)),
)

/** The page's key terms: the longest-lived words of the h1, then the title, up to three. */
export function keyTerms(page: PageFacts, count = 3): string[] {
  const sources = [
    page.html?.headings.find((heading) => heading.level === 1)?.text ?? '',
    page.html?.title ?? '',
  ]
  const terms: string[] = []
  const seen = new Set<string>()
  for (const source of sources) {
    for (const word of writtenWords(source)) {
      const bare = word.replace(/^ال/u, '')
      const key = nameKey(word)
      if (bare.length < 3 || word.length < 4 || GENERIC.has(key) || seen.has(nameKey(bare)))
        continue
      seen.add(nameKey(bare))
      terms.push(word)
      if (terms.length === count) return terms
    }
  }
  return terms
}

/** Whether the page's own words, as written, include the spelling (a Latin one without its case). */
export function writes(corpus: ReadonlySet<string>, spelling: string): boolean {
  return corpus.has(/\p{Script=Arabic}/u.test(spelling) ? spelling : spelling.toLowerCase())
}

/** The words the page writes: its text, title, description, headings and alt texts. */
export function pageWords(page: PageFacts): Set<string> {
  const out = new Set<string>()
  const add = (text: string) => {
    for (const word of writtenWords(text)) out.add(word)
    for (const word of text.toLowerCase().match(/[a-z0-9]+/gu) ?? []) out.add(word)
  }
  for (const segment of page.text?.segments ?? []) if (!segment.code) add(segment.text)
  add(page.html?.title ?? '')
  for (const meta of page.html?.metas ?? []) {
    if (meta.name === 'description' || meta.property === 'og:description') add(meta.content ?? '')
  }
  for (const heading of page.html?.headings ?? []) add(heading.text)
  for (const alt of page.html?.textAlternatives ?? []) add(alt.text)
  return out
}
