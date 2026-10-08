import type { SpellingKind } from '@arablyzer/collectors'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = `typed-${SpellingKind}`

/**
 * Misspellings of the page's key terms that people type and the page never writes (docs/design/
 * plans/arabic-native.md §12). For up to three terms of the h1 and title, the common misspellings
 * are made (hamza, ta marbuta, alef maqsura, a letter dropped or swapped, Arabizi); Google's public
 * suggestions say which of them people really type; a finding for each of those the page's words
 * do not include. Behind ARABLYZER_SUGGEST=1 and a tool's scan only (needs `suggest`). Minor.
 */
export const rule = defineRule({
  id: 'misspellings-uncovered',
  version: '1.0.0',
  category: 'ar-content',
  severity: 'minor',
  needs: ['suggest'],
  messages: [
    'typed-ta-marbuta',
    'typed-hamza',
    'typed-ya',
    'typed-arabizi',
    'typed-drop',
    'typed-swap',
  ],
  appliesTo: (_page, evidence) => evidence?.outside?.suggest?.outcome === 'checked',
  detect: ({ outside }): DetectorFinding<Message>[] => {
    const suggest = outside?.suggest
    if (suggest?.outcome !== 'checked') return []
    return suggest.terms.flatMap((term) =>
      term.variants
        .filter((variant) => variant.typed === true && !variant.covered)
        .map((variant): DetectorFinding<Message> => ({
          message: `typed-${variant.kind}`,
          values: {
            term: term.term,
            variant: variant.text,
            suggestion: variant.suggestion ?? '',
          },
          snippet: variant.text,
          key: variant.text,
        })),
    )
  },
})
