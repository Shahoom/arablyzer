import { isAllCaps, PROMOTION } from '@arablyzer/rules/feed-title'

// The title fixer (M10.1): a product title as Google Merchant Center asks it to be, with what can be
// mended mended and the rest said. The same words and limits as the feed-text-quality rule.

/** Merchant Center's longest title, in characters. */
export const MAX_TITLE = 150

export type TitleChange = 'tatweel' | 'promotion' | 'caps' | 'spaces' | 'long'

export interface TitleResult {
  readonly title: string
  readonly changes: readonly TitleChange[]
}

const TATWEEL = /ـ+/g
/** What joins a title to the offer after it: dashes, bars, colons, commas, and «و». */
const TAIL_JOINERS = /[\s\-–—|:/،,+]+(?:و(?=\s))?\s*$/u

function sentenceCase(word: string): string {
  // 50ML and 2XL stay as a unit; PERFUME becomes Perfume.
  if (/\d/.test(word)) return word.replace(/[A-Z]+/g, (unit) => unit.toLowerCase())
  return word.charAt(0) + word.slice(1).toLowerCase()
}

export function fixProductTitle(input: string): TitleResult {
  const changes: TitleChange[] = []
  let title = input.normalize('NFC')
  if (TATWEEL.test(title)) {
    title = title.replace(TATWEEL, '')
    changes.push('tatweel')
  }
  const promotion = PROMOTION.exec(title)
  if (promotion !== null) {
    // An offer after the product's name is cut off with its joiners; one at the start is only removed.
    const before = title.slice(0, promotion.index).replace(TAIL_JOINERS, '').trim()
    title =
      before !== ''
        ? before
        : title.replace(new RegExp(PROMOTION.source, 'giu'), ' ').replace(/^[\s\-–—|:/،,+]+/u, '')
    changes.push('promotion')
  }
  if (isAllCaps(title)) {
    title = title
      .split(/(\s+)/)
      .map((part) => (/\p{Script=Latin}/u.test(part) ? sentenceCase(part) : part))
      .join('')
    changes.push('caps')
  }
  const spaced = title.replace(/\s+/g, ' ').trim()
  if (spaced !== title) {
    title = spaced
    changes.push('spaces')
  }
  const letters = Array.from(title)
  if (letters.length > MAX_TITLE) {
    const cut = letters.slice(0, MAX_TITLE).join('')
    title = (letters[MAX_TITLE] === ' ' ? cut : cut.replace(/\s+\S*$/, '') || cut).trim()
    changes.push('long')
  }
  return { title, changes }
}
