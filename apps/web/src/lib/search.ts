/**
 * The tools' directory's search (M2.2): the typed words and each card's text are compared as
 * people type Arabic, whatever the page writes: in lower case, أ إ آ ٱ as ا, ة as ه, ى as ي,
 * without tatweel or harakat.
 */

/** Tatweel, the harakat and the other marks written over or under a letter, and superscript alef. */
const MARKS = /\u0640|[\u064b-\u065f]|\u0670/g
/** The alef with a hamza above or below, with a madda, and alef wasla. */
const ALEFS = /[\u0622\u0623\u0625\u0671]/g

export function searchable(text: string): string {
  return text
    .toLowerCase()
    .replace(MARKS, '')
    .replace(ALEFS, '\u0627')
    .replaceAll('\u0629', '\u0647')
    .replaceAll('\u0649', '\u064a')
}

/** The words typed, each as searchable() writes it. */
export function searchWords(typed: string): string[] {
  return searchable(typed)
    .split(/\s+/)
    .filter((word) => word !== '')
}

/** The definite article, which a word typed with it matches without it too: «الاتجاه», «اتجاه». */
const ARTICLE = '\u0627\u0644'

/** Whether a card's text, as searchable() writes it, holds every word typed. */
export function matchesAll(text: string, words: readonly string[]): boolean {
  return words.every(
    (word) =>
      text.includes(word) ||
      // Past the article, a word of two letters at least: «الو» is not «و».
      (word.startsWith(ARTICLE) && word.length > 3 && text.includes(word.slice(ARTICLE.length))),
  )
}
