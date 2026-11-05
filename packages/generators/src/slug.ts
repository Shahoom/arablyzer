// The Arabic slug generator (M2.3b, M10.1): a page's title as the last part of its address, in Arabic,
// without what makes one word two to a search (harakat, tatweel) or breaks a URL. What it writes
// is what the url-slug-invalid rule passes (issue #27).
import { MAX_SLUG_LENGTH } from '@arablyzer/rules/url-slug'

/** Harakat, superscript alef and tatweel. */
const MARKS = /[ً-ٰٟـ]/g

export interface SlugResult {
  /** As the address bar shows it. */
  readonly slug: string
  /** As it is sent: each non-ASCII character percent-encoded in UTF-8. */
  readonly encoded: string
  /** The title made more than the rule's length: the slug stops at the last whole word that fits. */
  readonly truncated: boolean
}

export function arabicSlug(title: string): SlugResult {
  const full = title
    .normalize('NFC')
    .replace(MARKS, '')
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .toLowerCase()
    // Letters and digits of any script stay; everything else is a word break.
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  const letters = Array.from(full)
  const truncated = letters.length > MAX_SLUG_LENGTH
  const cut = letters.slice(0, MAX_SLUG_LENGTH)
  // Stop at a whole word: the hyphen before the cut, unless the first word alone is too long.
  const slug = !truncated
    ? full
    : letters[MAX_SLUG_LENGTH] === '-'
      ? cut.join('')
      : cut.join('').replace(/-[^-]*$/, '') || cut.join('')
  return { slug, encoded: encodeURIComponent(slug), truncated }
}
