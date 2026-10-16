import type { PageFacts } from '@arablyzer/collectors'
import { pageAddress } from '../../lib/url-params'
import { defineRule } from '../../rule'

/** A page number in the address: ?page=2, ?paged=2, ?p=2, ?pg=2, /page/2/. 2 and over. */
function pageNumber(url: string): number | null {
  try {
    const parsed = new URL(url)
    for (const name of ['page', 'paged', 'p', 'pg', 'pagenumber']) {
      const value = parsed.searchParams.get(name)
      if (value !== null && /^\d+$/.test(value)) return Number(value)
    }
    const match = /\/(?:page|pages|p)\/(\d+)(?:\/|$)/i.exec(parsed.pathname)
    return match?.[1] === undefined ? null : Number(match[1])
  } catch {
    return null
  }
}

/**
 * M6.1: a page of a list (page 2 and over, told by its address or by a `rel="prev"` link) whose
 * canonical address is not itself: usually the first page, or the category. Google then takes the
 * later pages for copies of the first and may never reach the products on them, which only they
 * link to. A paginated page with no canonical, or its own, passes.
 */
export const rule = defineRule({
  id: 'pagination-canonical',
  version: '1.0.0',
  category: 'index',
  severity: 'moderate',
  needs: ['html'],
  messages: ['canonical-elsewhere'],
  appliesTo: (page) => isPaginated(page),
  detect: ({ page }) => {
    const links = page.html?.links ?? []
    const canonical = links.find((link) => link.rel.includes('canonical') && link.url !== null)
    if (canonical?.url == null) return []
    if (pageAddress(canonical.url) === pageAddress(page.url)) return []
    const number = pageNumber(page.url)
    return [
      {
        message: 'canonical-elsewhere' as const,
        values: { canonical: canonical.url, page: number ?? 0 },
        selector: canonical.selector,
        ...(canonical.snippet === null ? {} : { snippet: canonical.snippet }),
        ...(canonical.location === null ? {} : { location: canonical.location }),
        key: canonical.url,
      },
    ]
  },
})

function isPaginated(page: PageFacts): boolean {
  const number = pageNumber(page.url)
  if (number !== null && number >= 2) return true
  return (page.html?.links ?? []).some((link) => link.rel.includes('prev') && link.href !== null)
}
