import { arabicWords, normalizeArabic } from './ar-normalize'

/**
 * Which Arabic a text is written in: Modern Standard (MSA), Gulf, Egyptian, Levantine or
 * Maghrebi. A compact marker lexicon, not a language-ID model (docs/design/plans/arabic-native.md
 * §8): each list holds frequent words and forms that a speaker of that dialect writes and a
 * Modern Standard writer almost never does, such as إزاي and عايز in Egyptian. Words shared by
 * two dialects (مش, شوي, وين, عشان, ليش) are left out of every list, so a hit is evidence for one
 * dialect. Spelled in the folded letters of normalizeArabic (ا for أ and إ, ي for ى, ه for ة), so
 * a page may spell them any way. The lists are a sample, not a dictionary: a dialect text with none
 * of these words reads as Modern Standard here, and the report says how many markers it counted.
 */
export const DIALECTS = ['gulf', 'egyptian', 'levantine', 'maghrebi'] as const
export type Dialect = (typeof DIALECTS)[number]
export type Variety = 'msa' | Dialect

const LEXICON: Readonly<Record<Dialect, string>> = {
  // Gulf and Iraqi: Najdi, Hijazi, Kuwaiti and Emirati forms.
  gulf: 'وايد شلون شلونك شلونكم ابغى تبغى تبي وش شنو شفيك الحين توني اكو ماكو ياخي هاذا هاذي',
  // Egyptian.
  egyptian:
    'ازاي ازيك ازيكم عايز عايزه عايزين عاوز عاوزه دلوقتي دلوقت كده كدا ليه ده دي بتاع بتاعت بتاعه فين امبارح النهارده برضو لسه علشان اوي مفيش ايوه ايوا معلش كام',
  // Levantine (Syrian, Lebanese, Jordanian, Palestinian).
  levantine: 'هلق شو بدي بدك بدنا بدها هيك هاي هدول كتير منيح لسا ازا كيفك قديش ايمتى هلقد',
  // Maghrebi (Moroccan, Algerian, Tunisian).
  maghrebi:
    'بزاف واش ديال ديالي ديالك ديالو ديالها ديالنا كيفاش علاش دابا غادي مزيان بغيت واخا حيت شحال هادشي برشا توا',
}

/** Words that appear in more than one list above, kept out of all (checked by a test). */
const MARKERS: ReadonlyMap<string, Dialect> = (() => {
  const seen = new Map<string, Dialect | null>()
  for (const dialect of DIALECTS) {
    for (const word of LEXICON[dialect].split(/\s+/)) {
      const key = normalizeArabic(word)
      const known = seen.get(key)
      seen.set(key, known === undefined || known === dialect ? dialect : null)
    }
  }
  const out = new Map<string, Dialect>()
  for (const [word, dialect] of seen) if (dialect !== null) out.set(word, dialect)
  return out
})()

/**
 * Function words and forms of Modern Standard that the dialects replace: the share of them is how
 * written-in-fusha the text is. They are not markers of a dialect (a Gulf writer uses «الذي» in a
 * formal paragraph), only the counterweight of the dialect words.
 */
const MSA_WORDS: ReadonlySet<string> = new Set(
  'الذي التي الذين اللذان اللتان سوف لقد وقد حيث لدى لدي هناك هؤلاء اولئك ذلك تلك خلال حول نحو عبر لان منذ ايضا جميع يمكن يجب ليس لم لن كما بينما حتي'
    .split(/\s+/)
    .map(normalizeArabic),
)

/** Countries (ISO) where each dialect is the everyday speech of the nine the tool covers. */
export const DIALECT_COUNTRIES: Readonly<Record<Dialect, readonly string[]>> = {
  gulf: ['SA', 'AE', 'KW', 'QA', 'BH', 'OM'],
  egyptian: ['EG'],
  levantine: ['JO'],
  maghrebi: ['MA'],
}

/** Arabic words in the whole text below which no verdict is given. */
export const MIN_WORDS = 80
/** Dialect hits below which the text counts as Modern Standard. */
export const MIN_HITS = 3
/** The share of all markers (dialect and Modern Standard) a dialect needs to be called. */
export const DIALECT_SHARE = 0.2

export interface DialectReading {
  readonly words: number
  /** Marker hits by variety (`msa` counts the Modern Standard function words). */
  readonly hits: Readonly<Record<Variety, number>>
  /** The variety the text is written in; null when there is too little text. */
  readonly label: Variety | null
  /** The share of each variety among all marker hits, whole percentages; empty with none. */
  readonly mix: Readonly<Record<Variety, number>>
  /** The most frequent markers found, at most two for each dialect, for the report. */
  readonly seen: readonly { readonly word: string; readonly dialect: Dialect }[]
}

const EMPTY: Readonly<Record<Variety, number>> = {
  msa: 0,
  gulf: 0,
  egyptian: 0,
  levantine: 0,
  maghrebi: 0,
}

/** Text in guillemets or curly quotes. */
const QUOTED = /«[^»]*»|“[^”]*”/gu

/** Counts the markers of a text. `minWords` is the length below which it gives no label. */
export function readDialect(
  text: string,
  options: { readonly minWords?: number; readonly minHits?: number } = {},
): DialectReading {
  const minWords = options.minWords ?? MIN_WORDS
  const minHits = options.minHits ?? MIN_HITS
  // A word quoted in «» is mentioned, not written in: a page about dialects quotes them.
  const words = arabicWords(text.replace(QUOTED, ' '))
  const hits: Record<Variety, number> = { ...EMPTY }
  const counts = new Map<string, number>()
  for (const word of words) {
    const dialect = MARKERS.get(word)
    if (dialect !== undefined) {
      hits[dialect]++
      counts.set(word, (counts.get(word) ?? 0) + 1)
    } else if (MSA_WORDS.has(word)) hits.msa++
  }
  const total = Object.values(hits).reduce((sum, count) => sum + count, 0)
  const mix: Record<Variety, number> = { ...EMPTY }
  if (total > 0)
    for (const key of Object.keys(mix) as Variety[])
      mix[key] = Math.round((100 * hits[key]) / total)
  const ranked = [...counts.entries()]
    .flatMap(([word, count]) => {
      const dialect = MARKERS.get(word)
      return dialect === undefined ? [] : [{ word, count, dialect }]
    })
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'ar'))
  const seen = DIALECTS.flatMap((dialect) =>
    ranked.filter((item) => item.dialect === dialect).slice(0, 2),
  )
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'ar'))
    .map(({ word, dialect }) => ({ word, dialect }))
  if (words.length < minWords) return { words: words.length, hits, label: null, mix, seen }
  const top = DIALECTS.reduce(
    (best, dialect) => (hits[dialect] > hits[best] ? dialect : best),
    DIALECTS[0],
  )
  const label: Variety =
    hits[top] >= minHits && hits[top] / Math.max(1, total) >= DIALECT_SHARE ? top : 'msa'
  return { words: words.length, hits, label, mix, seen }
}

/** Whether a variety is the everyday speech of a country (Modern Standard is fine everywhere). */
export function fitsCountry(variety: Variety, country: string): boolean {
  return variety === 'msa' || DIALECT_COUNTRIES[variety].includes(country)
}

/** Dialects with at least `MIN_HITS` hits and a fifth of the dialect hits: a text that mixes. */
export function mixedDialects(reading: DialectReading): Dialect[] {
  const dialectHits = DIALECTS.reduce((sum, dialect) => sum + reading.hits[dialect], 0)
  return DIALECTS.filter(
    (dialect) =>
      reading.hits[dialect] >= MIN_HITS && reading.hits[dialect] / Math.max(1, dialectHits) >= 0.3,
  )
}

const HEADING_SELECTOR = /(?:^|>)\s*h[1-6](?![a-z0-9-])/i
/** Words of the headings at which their register is judged. */
const MIN_HEADING_WORDS = 8

export interface PageDialect {
  /** The whole text a visitor reads. */
  readonly whole: DialectReading
  /** The headings alone, judged on fewer words, or null when they have too few. */
  readonly headings: DialectReading | null
  /** Everything but the headings. */
  readonly body: DialectReading
}

/** The dialect of a page: of all its text, of its headings, and of the rest. */
export function dialectOfPage(
  segments: readonly { readonly text: string; readonly selector: string; readonly code: boolean }[],
): PageDialect {
  const heading: string[] = []
  const rest: string[] = []
  for (const segment of segments) {
    if (segment.code) continue
    // A word quoted in «» is mentioned, not written in: a page about dialects quotes them.
    const text = segment.text.replace(QUOTED, ' ')
    const last = segment.selector.split('>').pop() ?? ''
    ;(HEADING_SELECTOR.test(last) ? heading : rest).push(text)
  }
  const headings = readDialect(heading.join('\n'), { minWords: MIN_HEADING_WORDS, minHits: 1 })
  return {
    whole: readDialect([...heading, ...rest].join('\n')),
    headings: headings.label === null ? null : headings,
    body: readDialect(rest.join('\n')),
  }
}

/** The register gap between headings and body: Modern Standard in one, colloquial in the other. */
export function registerGap(page: PageDialect): 'formal-headings' | 'colloquial-headings' | null {
  const { headings, body } = page
  if (headings?.label == null || body.label === null) return null
  if (headings.label === 'msa' && body.label !== 'msa') return 'formal-headings'
  if (headings.label !== 'msa' && body.label === 'msa') return 'colloquial-headings'
  return null
}
