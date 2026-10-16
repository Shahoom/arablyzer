import { entries, isEmpty, placeProblems, type Problem } from '../../lib/jsonld-objects'
import { topProducts } from '../../lib/product-offers'
import { defineRule, type DetectorFinding } from '../../rule'

const MESSAGES = ['no-name', 'no-image', 'no-offer'] as const
type Message = (typeof MESSAGES)[number]

/**
 * M6.1: what a product page's markup needs for Google to show it as a product: a name, an image,
 * and an offer, a review or a rating to show beside them. Only the products a page describes of
 * itself (the top of a block, or its @graph) are judged.
 */
export const rule = defineRule({
  id: 'product-required-missing',
  version: '1.0.0',
  category: 'schema',
  severity: 'moderate',
  needs: ['html'],
  messages: MESSAGES,
  appliesTo: (page) => topProducts(page).length > 0,
  detect: ({ page }) =>
    placeProblems(
      topProducts(page).flatMap((product): Problem<Message>[] => {
        const has = (property: string) =>
          entries(product, property).some((entry) => !isEmpty(entry.value))
        const problems: Problem<Message>[] = []
        if (!has('name')) problems.push({ message: 'no-name', at: product, values: {} })
        if (!has('image')) problems.push({ message: 'no-image', at: product, values: {} })
        if (!has('offers') && !has('review') && !has('aggregateRating')) {
          problems.push({ message: 'no-offer', at: product, values: {} })
        }
        return problems
      }),
    ).map((finding): DetectorFinding<Message> => finding),
})
