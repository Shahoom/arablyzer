// What makes one page's address two to a crawler, or hard to share (M10.1, issue #27): the same
// check judges a page's address and canonical, and is the one the Arabic slug generator writes to.

export type SlugProblem = 'marks' | 'digits' | 'separators' | 'long'

/**
 * A slug longer than this many characters (as people read it, not percent-encoded) is judged long.
 * Google gives no number and asks for simple, readable addresses; this is Arablyzer's threshold
 * (about fifteen Arabic words), which no common page title reaches once it is written as a slug.
 */
export const MAX_SLUG_LENGTH = 100

/** Harakat, superscript alef and tatweel: a word spelled with them is another address. */
const MARKS = /[ً-ٰٟـ]/
/** Arabic-Indic and Persian digits. */
const EASTERN_DIGITS = /[٠-٩۰-۹]/
/**
 * What is not a word break people type: an underscore, a space, a plus sign, a percent sign left
 * after decoding (a doubly encoded address), a capital Latin letter (addresses are case-sensitive,
 * so /Coffee and /coffee are two), two hyphens in a row, and punctuation that needs encoding.
 */
const SEPARATORS = /[_\s+%A-Z]|--|[,;:'"!?@#$&*=|<>()[\]{}\\^`~]/

function decoded(segment: string): string | null {
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

/** The path's segments as people read them; a segment that is not valid UTF-8 is left out. */
export function slugSegments(pathname: string): string[] {
  return pathname
    .split('/')
    .filter((segment) => segment !== '')
    .flatMap((segment) => {
      const text = decoded(segment)
      return text === null ? [] : [text]
    })
}

/** The problems of a path's slugs, each once, in a fixed order; the first segment with one is `slug`. */
export function slugProblems(pathname: string): { problem: SlugProblem; slug: string }[] {
  const segments = slugSegments(pathname)
  const found: { problem: SlugProblem; slug: string }[] = []
  const add = (problem: SlugProblem, test: (segment: string) => boolean) => {
    const slug = segments.find(test)
    if (slug !== undefined) found.push({ problem, slug })
  }
  add('marks', (segment) => MARKS.test(segment))
  add('digits', (segment) => EASTERN_DIGITS.test(segment))
  add('separators', (segment) => SEPARATORS.test(segment))
  const last = segments.at(-1)
  if (last !== undefined && Array.from(last).length > MAX_SLUG_LENGTH) {
    found.push({ problem: 'long', slug: last })
  }
  return found
}
