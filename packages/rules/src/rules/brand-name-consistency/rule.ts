import { brandIssues, collectBrandNames } from '../../lib/brand-names'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'disagree' | 'spelling' | 'alternate-missing'

/**
 * The brand's name written the same way everywhere (docs/design/plans/arabic-native.md §7): the
 * title, og:site_name, the Organization and WebSite JSON-LD (name and alternateName), a logo's
 * alt text and the footer's copyright line are read, folded (hamza forms, ta marbuta, alef
 * maqsura, tatweel and diacritics in Arabic; case and punctuation in Latin) and held against the
 * most trusted one of their script. Different names, one name spelled two ways, and an Arabic and
 * a Latin form of the brand with no alternateName to pair them are findings. Minor.
 */
export const rule = defineRule({
  id: 'brand-name-consistency',
  version: '1.0.0',
  category: 'ar-content',
  severity: 'minor',
  needs: ['html', 'text'],
  messages: ['disagree', 'spelling', 'alternate-missing'],
  appliesTo: (page) => page.html !== null && page.text !== null,
  detect: ({ page }): DetectorFinding<Message>[] =>
    brandIssues(collectBrandNames(page))
      .slice(0, 6)
      .map((issue): DetectorFinding<Message> => {
        switch (issue.kind) {
          case 'alternate-missing':
            return {
              message: 'alternate-missing',
              values: {
                arabic: issue.arabic.name,
                arabicSource: issue.arabic.source,
                latin: issue.latin.name,
                latinSource: issue.latin.source,
              },
              key: 'alternate',
            }
          default:
            return {
              message: issue.kind,
              values: {
                first: issue.first.name,
                firstSource: issue.first.source,
                second: issue.second.name,
                secondSource: issue.second.source,
              },
              snippet: `${issue.first.name} / ${issue.second.name}`,
              key: `${issue.kind}:${issue.first.key}:${issue.second.name}`,
            }
        }
      }),
})
