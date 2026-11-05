// What a product title may carry (M6.1, M10.1): the feed-text-quality rule judges feeds with it,
// and the title fixer writes titles that pass it.

/**
 * Promotional wording the specification asks a title to leave out («شحن مجاني»، "free shipping",
 * "sale", "% off"): Arabic phrases are whole words, Latin ones are matched as words.
 */
export const PROMOTION =
  /(?<!\p{L})(?:شحن مجاني|توصيل مجاني|عرض خاص|أفضل سعر|افضل سعر|أقل سعر|اقل سعر|لفترة محدودة|اشتري الآن|اشتر الآن|خصم|تخفيضات|تخفيض)(?!\p{L})|\b(?:free shipping|free delivery|best price|lowest price|buy now|limited time|sale)\b|\d+\s*%\s*(?:off|خصم)|%\s*off\b/iu

/** The text of a title that reads as shouting: Latin letters, most of the letters, none lowercase. */
export function isAllCaps(title: string): boolean {
  const latin = title.match(/\p{Script=Latin}/gu) ?? []
  const letters = title.match(/\p{L}/gu) ?? []
  if (latin.length < 4 || latin.length * 2 <= letters.length) return false
  return !/\p{Ll}/u.test(latin.join(''))
}
