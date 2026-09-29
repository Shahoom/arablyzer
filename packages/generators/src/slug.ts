// The Arabic slug generator (M2.3b): a page's title as the last part of its address, in Arabic,
// without what makes one word two to a search (harakat, tatweel) or breaks a URL.

/** Harakat, superscript alef and tatweel. */
const MARKS = /[\u064B-\u065F\u0670\u0640]/g

export interface SlugResult {
  /** As the address bar shows it. */
  readonly slug: string
  /** As it is sent: each non-ASCII character percent-encoded in UTF-8. */
  readonly encoded: string
}

export function arabicSlug(title: string): SlugResult {
  const slug = title
    .normalize('NFC')
    .replace(MARKS, '')
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .toLowerCase()
    // Letters and digits of any script stay; everything else is a word break.
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return { slug, encoded: encodeURIComponent(slug) }
}
