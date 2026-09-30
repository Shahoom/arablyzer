import type { PageFacts, SourceLocation } from '@arablyzer/collectors'
import { checkHreflang, type HreflangProblem } from '../../lib/hreflang'
import { defineRule } from '../../rule'

interface HreflangEntry {
  readonly hreflang: string
  readonly href: string
  readonly source: 'link' | 'header'
  readonly selector?: string
  readonly snippet?: string
  readonly location?: SourceLocation
}

/** The value the subtag fills in each message. */
const SUBTAG_PLACEHOLDER: Partial<Record<HreflangProblem, string>> = {
  'unknown-language': 'language',
  'unknown-script': 'script',
  'unknown-region': 'region',
  'uk-region': 'region',
}

export const rule = defineRule({
  id: 'hreflang-invalid-code',
  version: '1.0.0',
  category: 'intl',
  severity: 'moderate',
  needs: ['http'],
  messages: [
    'underscore',
    'unknown-language',
    'unknown-script',
    'unknown-region',
    'uk-region',
    'malformed',
  ],
  appliesTo: (page) => hreflangEntries(page).length > 0,
  detect: ({ page }) =>
    hreflangEntries(page).flatMap((entry) => {
      const check = checkHreflang(entry.hreflang)
      if (check === null) return []
      const placeholder = SUBTAG_PLACEHOLDER[check.problem]
      return [
        {
          message: check.problem,
          values: {
            hreflang: entry.hreflang,
            href: entry.href,
            source: entry.source,
            suggestion: check.suggestion,
            ...(placeholder === undefined ? {} : { [placeholder]: check.subtag ?? '' }),
          },
          ...(entry.selector === undefined ? {} : { selector: entry.selector }),
          ...(entry.snippet === undefined ? {} : { snippet: entry.snippet }),
          ...(entry.location === undefined ? {} : { location: entry.location }),
          key: `${entry.source}:${entry.hreflang}:${entry.href}`,
        },
      ]
    }),
})

/** hreflang annotations in <link rel="alternate"> elements and in Link headers. */
function hreflangEntries(page: PageFacts): HreflangEntry[] {
  const links = (page.html?.links ?? [])
    .filter((link) => link.rel.includes('alternate') && link.hreflang !== null)
    .map((link) => ({
      hreflang: link.hreflang ?? '',
      href: link.href ?? '',
      source: 'link' as const,
      selector: link.selector,
      ...(link.snippet === null ? {} : { snippet: link.snippet }),
      ...(link.location === null ? {} : { location: link.location }),
    }))
  const headers = page.linkHeaders
    .filter((entry) => entry.rel.includes('alternate') && entry.hreflang !== null)
    .map((entry) => ({
      hreflang: entry.hreflang ?? '',
      href: entry.target,
      source: 'header' as const,
      snippet: entry.raw,
    }))
  return [...links, ...headers]
}
