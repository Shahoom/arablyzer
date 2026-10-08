import { lossOf, type SearchVariantKind } from '@arablyzer/collectors'
import { defineRule, type DetectorFinding } from '../../rule'

type Message =
  | 'loses'
  | 'lost-ta-marbuta'
  | 'lost-alef'
  | 'lost-ya'
  | 'lost-tatweel'
  | 'lost-diacritics'
  | 'lost-digits'

const BY_KIND: Readonly<Partial<Record<SearchVariantKind, Message>>> = {
  'ta-marbuta': 'lost-ta-marbuta',
  alef: 'lost-alef',
  ya: 'lost-ya',
  tatweel: 'lost-tatweel',
  diacritics: 'lost-diacritics',
  digits: 'lost-digits',
}

/**
 * A site search that does not treat the spellings of one Arabic word as one: the scan asked the
 * search for words of the page, then for the same words with ة for ه, hamza on or off the alef,
 * ى for ي, a tatweel, a diacritic, or the digits of the other script, and the answer was none, or
 * fewer than half, of what the word's own spelling found. The summary says how many of the variants
 * asked were lost; one finding for each. Asked only in a tool's scan (needs `search`).
 */
export const rule = defineRule({
  id: 'search-spelling-variants',
  version: '1.0.0',
  category: 'ar-content',
  severity: 'moderate',
  needs: ['search'],
  messages: [
    'loses',
    'lost-ta-marbuta',
    'lost-alef',
    'lost-ya',
    'lost-tatweel',
    'lost-diacritics',
    'lost-digits',
  ],
  appliesTo: (_page, evidence) => {
    const search = evidence?.search
    return search?.outcome === 'tested' && lossOf(search.words).total > 0
  },
  detect: ({ search }): DetectorFinding<Message>[] => {
    if (search?.outcome !== 'tested') return []
    const { lost, total } = lossOf(search.words)
    if (lost === 0) return []
    const summary: DetectorFinding<Message> = {
      message: 'loses',
      values: { lost, total, requests: search.requests },
      key: 'summary',
    }
    const variants = search.words.flatMap((word) =>
      (word.base.results ?? 0) === 0
        ? []
        : word.variants.flatMap((variant): DetectorFinding<Message>[] => {
            const message = BY_KIND[variant.kind]
            if (message === undefined || !variant.counted || variant.outcome !== 'lost') return []
            return [
              {
                message,
                values: {
                  word: word.word,
                  query: variant.query,
                  found: variant.results ?? 0,
                  wanted: word.base.results ?? 0,
                },
                key: `${word.word}:${variant.kind}`,
              },
            ]
          }),
    )
    return [summary, ...variants]
  },
})
