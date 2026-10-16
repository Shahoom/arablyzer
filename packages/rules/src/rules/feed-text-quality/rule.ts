import type { FeedItem } from '@arablyzer/collectors'
import { attributeOf, itemLabel, MAX_DESCRIPTION_LENGTH, MAX_TITLE_LENGTH } from '../../lib/feed'
import { STRETCHED_WORD } from '../../lib/arabic'
import { firstGarbledRun } from '../../lib/mojibake'
import { defineRule, type DetectorFinding } from '../../rule'

const MESSAGES = [
  'title-long',
  'description-long',
  'title-caps',
  'title-promotional',
  'description-same-as-title',
  'tatweel',
  'garbled',
] as const
type Message = (typeof MESSAGES)[number]

/**
 * Promotional wording the specification asks a title to leave out («شحن مجاني»، "free shipping",
 * "sale", "% off"): Arabic phrases are whole words, Latin ones are matched as words.
 */
const PROMOTION =
  /(?<!\p{L})(?:شحن مجاني|توصيل مجاني|عرض خاص|أفضل سعر|افضل سعر|أقل سعر|اقل سعر|لفترة محدودة|اشتري الآن|اشتر الآن|خصم|تخفيضات|تخفيض)(?!\p{L})|\b(?:free shipping|free delivery|best price|lowest price|buy now|limited time|sale)\b|\d+\s*%\s*(?:off|خصم)|%\s*off\b/iu

/** The text of a title that reads as shouting: Latin letters, most of the letters, none lowercase. */
function isAllCaps(title: string): boolean {
  const latin = title.match(/\p{Script=Latin}/gu) ?? []
  const letters = title.match(/\p{L}/gu) ?? []
  if (latin.length < 4 || latin.length * 2 <= letters.length) return false
  return !/\p{Ll}/u.test(latin.join(''))
}

interface Hit {
  readonly message: Message
  readonly sample: string
}

/**
 * M6.1: the quality of a feed's titles and descriptions: Merchant Center's limits (150 and 5,000
 * characters), shouting in capitals, promotional wording in a title, a description that repeats
 * the title, Arabic stretched with tatweel, and Arabic text garbled by a wrong encoding. One
 * finding for each kind, with how many products and the first.
 */
export const rule = defineRule({
  id: 'feed-text-quality',
  version: '1.0.0',
  category: 'commerce',
  severity: 'moderate',
  needs: ['feed'],
  messages: MESSAGES,
  appliesTo: (_page, evidence) => evidence?.feed?.kind === 'feed',
  detect: ({ feed }): DetectorFinding<Message>[] => {
    if (feed?.kind !== 'feed') return []
    const groups = new Map<
      Message,
      { count: number; sample: string; item: FeedItem; index: number }
    >()
    feed.items.forEach((item, index) => {
      for (const hit of hitsOf(item)) {
        const group = groups.get(hit.message)
        if (group === undefined)
          groups.set(hit.message, { count: 1, sample: hit.sample, item, index })
        else group.count++
      }
    })
    return MESSAGES.flatMap((message): DetectorFinding<Message>[] => {
      const group = groups.get(message)
      if (group === undefined) return []
      return [
        {
          message,
          values: {
            count: group.count,
            id: itemLabel(group.item, group.index),
            sample: group.sample,
            max: message === 'description-long' ? MAX_DESCRIPTION_LENGTH : MAX_TITLE_LENGTH,
          },
          snippet: group.sample.slice(0, 200),
          location: { line: group.item.line },
          key: message,
        },
      ]
    })
  },
})

function hitsOf(item: FeedItem): Hit[] {
  const hits: Hit[] = []
  const title = attributeOf(item, 'title')
  const description = attributeOf(item, 'description')
  if (title !== null) {
    if (Array.from(title).length > MAX_TITLE_LENGTH)
      hits.push({ message: 'title-long', sample: title })
    if (isAllCaps(title)) hits.push({ message: 'title-caps', sample: title })
    const promotion = PROMOTION.exec(title)
    if (promotion !== null) hits.push({ message: 'title-promotional', sample: title })
    if (STRETCHED_WORD.test(title)) hits.push({ message: 'tatweel', sample: title })
  }
  if (description !== null) {
    if (Array.from(description).length > MAX_DESCRIPTION_LENGTH) {
      hits.push({ message: 'description-long', sample: description })
    }
    if (
      title !== null &&
      description.replace(/\s+/g, ' ').toLowerCase() === title.replace(/\s+/g, ' ').toLowerCase()
    ) {
      hits.push({ message: 'description-same-as-title', sample: description })
    }
  }
  const garbled = firstGarbledRun(`${title ?? ''}\n${description ?? ''}`)
  if (garbled !== null) hits.push({ message: 'garbled', sample: garbled.found })
  return hits
}
