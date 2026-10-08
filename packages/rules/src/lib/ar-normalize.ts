/**
 * The folding that lets two spellings of one Arabic or Latin name be compared: what search
 * engines and readers treat as the same word. Shared by the brand-name, dialect and spelling-set
 * features.
 */

/** Harakat, Quranic marks and the superscript alef. */
export const ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g
const INVISIBLE = new RegExp('[\\u200B-\\u200F\\u202A-\\u202E\\u2060\\uFEFF]', 'g')
const ARABIC_INDIC = /[٠-٩]/g
const PERSIAN = /[۰-۹]/g

/** Letters folded together: hamza forms of alef, ta marbuta, alef maqsura, hamza on waw and ya. */
export function normalizeArabic(text: string): string {
  return text
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(ARABIC_MARKS, '')
    .replace(/ـ/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ی/g, 'ي')
    .replace(/ک/g, 'ك')
    .replace(ARABIC_INDIC, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(PERSIAN, (digit) => String(digit.charCodeAt(0) - 0x06f0))
}

/** Case, accents and the letters' compatibility forms folded away. */
export function normalizeLatin(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(INVISIBLE, '')
    .toLowerCase()
    .replace(/&/g, 'and')
}

/**
 * A name's comparison key: both folds, then everything that is not a letter or a digit removed
 * (spaces, hyphens, dots, ampersands), so «Al-Waha», «Al Waha» and «alwaha» are one key.
 */
export function nameKey(name: string): string {
  return normalizeLatin(normalizeArabic(name)).replace(/[^\p{L}\p{N}]+/gu, '')
}

export type NameScript = 'ar' | 'latin' | 'mixed' | 'none'

export function scriptOf(name: string): NameScript {
  const arabic = /\p{Script=Arabic}/u.test(name)
  const latin = /\p{Script=Latin}/u.test(name)
  return arabic && latin ? 'mixed' : arabic ? 'ar' : latin ? 'latin' : 'none'
}

/** The Arabic words of a text, folded, for the lexicon features. */
export function arabicWords(text: string): string[] {
  return (normalizeArabic(text).match(/[ء-يٱ-ۓ]+/g) ?? []).filter((word) => word.length > 0)
}
