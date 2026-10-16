import { alternates } from '../../lib/hreflang-set'
import { defineRule } from '../../rule'

/**
 * M6.1: a page that lists two or more language or region versions without an `x-default`, the
 * address for visitors of every other language or region (a store with SA and AE versions and no
 * page for the rest of the world). Google recommends it; the rule is minor. A Link header counts
 * as the page's own list too.
 */
export const rule = defineRule({
  id: 'hreflang-x-default-missing',
  version: '1.0.0',
  category: 'intl',
  severity: 'minor',
  needs: ['html'],
  messages: ['missing'],
  appliesTo: (page) => versionsOf(page).size >= 2,
  detect: ({ page }) => {
    const found = alternates(page)
    const [first] = found
    const header = page.linkHeaders.some(
      (entry) => entry.rel.includes('alternate') && entry.hreflang?.toLowerCase() === 'x-default',
    )
    if (header || found.some((alternate) => alternate.code.toLowerCase() === 'x-default')) return []
    return [
      {
        message: 'missing' as const,
        values: { count: versionsOf(page).size },
        ...(first === undefined
          ? {}
          : {
              selector: first.link.selector,
              ...(first.link.snippet === null ? {} : { snippet: first.link.snippet }),
              ...(first.link.location === null ? {} : { location: first.link.location }),
            }),
        key: 'x-default',
      },
    ]
  },
})

/** The distinct versions listed, not counting x-default. */
function versionsOf(page: Parameters<typeof alternates>[0]): Set<string> {
  return new Set(
    alternates(page)
      .map((alternate) => alternate.code.toLowerCase())
      .filter((code) => code !== 'x-default'),
  )
}
