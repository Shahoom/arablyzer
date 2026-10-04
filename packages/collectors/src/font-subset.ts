import { mergeRanges, type CodePointRange } from './code-points'
import { fontCoverage } from './font-coverage'

/** subset-font 2.x: a font file cut to the characters of `text`, in the format asked for. */
type SubsetData = (
  font: Buffer,
  text: string,
  options?: { readonly targetFormat?: 'sfnt' | 'woff' | 'woff2' | 'truetype' },
) => Promise<Buffer>

/**
 * Loaded when a subset is made, not when this file is: its WebAssembly glue cannot load in the
 * CLI's bundle, which never makes one.
 */
async function subsetFontData(...args: Parameters<SubsetData>): ReturnType<SubsetData> {
  // @ts-expect-error subset-font ships no type declarations
  const module = (await import('subset-font')) as { default: SubsetData }
  return module.default(...args)
}

/**
 * Characters every Arabic subset keeps whatever the page showed: the digits of both scripts,
 * spaces, the joiners that shape text (ZWJ, ZWNJ), the direction marks, the tatweel and the
 * punctuation of Arabic and Latin. A subset without them breaks the next page that uses the font.
 */
const ALWAYS =
  '  ‌‍‎‏0123456789٠١٢٣٤٥٦٧٨٩' + '۰۱۲۳۴۵۶۷۸۹' + '.,:;!?-+=%/()[]{}"\'*&#@_|٪٫٬،؛؟«»ـ–—…'

/** The Arabic presentation forms A and B: what a font without shaping tables draws letters with. */
const PRESENTATION: readonly CodePointRange[] = [
  [0xfb50, 0xfdff],
  [0xfe70, 0xfeff],
]

/** The code points of a text, each once. */
const codePointsOf = (text: string): Set<number> => {
  const set = new Set<number>()
  for (const char of Array.from(text)) set.add(char.codePointAt(0) ?? 0)
  return set
}

/**
 * The characters a font file must keep for a page: those the page showed, the base set above and
 * the Arabic presentation forms whose letters (by their compatibility decomposition) the page
 * showed, so a font that draws joined forms by those code points keeps them. The font's own
 * shaping tables (GSUB, GPOS) are kept by the subsetter, which closes over them: the forms a
 * letter takes by position, and the ligatures, stay.
 */
export function subsetCharacters(shown: string): string {
  const wanted = codePointsOf(shown + ALWAYS)
  for (const [first, last] of PRESENTATION) {
    for (let code = first; code <= last; code++) {
      const letters = String.fromCodePoint(code).normalize('NFKC')
      if (letters.length === 0 || letters === String.fromCodePoint(code)) continue
      if (Array.from(letters).every((letter) => wanted.has(letter.codePointAt(0) ?? 0)))
        wanted.add(code)
    }
  }
  return String.fromCodePoint(...[...wanted].sort((a, b) => a - b))
}

/** Characters of `text` that the subset is asked to keep: no controls, none past the BMP's private use. */
const keepable = (text: string): string =>
  Array.from(text)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0
      return code >= 0x20 && code !== 0x7f && !(code >= 0x80 && code < 0xa0) && code <= 0x10ffff
    })
    .join('')

export interface FontSubset {
  /** WOFF2. */
  readonly woff2: Uint8Array
  /** The code points the subset draws (its cmap). */
  readonly ranges: readonly CodePointRange[]
}

/** The font data may take at most this long to subset; harfbuzz runs in the thread that asks. */
export const MAX_SUBSET_INPUT = 5 * 1024 * 1024

/**
 * A subset of a font file (TrueType, OpenType, WOFF or WOFF2) holding only the characters of
 * `shown` and what Arabic shaping needs (subsetCharacters), as WOFF2, with GSUB and GPOS kept.
 * HarfBuzz's subsetter does the work. Throws when the file is not a font it reads or is over
 * MAX_SUBSET_INPUT.
 */
export async function subsetFont(bytes: Uint8Array, shown: string): Promise<FontSubset> {
  if (bytes.byteLength > MAX_SUBSET_INPUT) throw new RangeError('The font file is too large')
  const text = keepable(subsetCharacters(shown))
  const out = await subsetFontData(Buffer.from(bytes), text, { targetFormat: 'woff2' })
  const woff2 = new Uint8Array(out.buffer, out.byteOffset, out.byteLength)
  return { woff2, ranges: fontCoverage(woff2) ?? [] }
}

/** A unicode-range descriptor value for ranges: `U+20,U+30-39,U+600-6FF`. */
export function unicodeRangeOf(ranges: readonly CodePointRange[]): string {
  return mergeRanges(ranges)
    .map(([first, last]) =>
      first === last
        ? `U+${first.toString(16).toUpperCase()}`
        : `U+${first.toString(16).toUpperCase()}-${last.toString(16).toUpperCase()}`,
    )
    .join(',')
}
