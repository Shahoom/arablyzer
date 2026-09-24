import type { PageFacts, SourceLocation } from '@arablyzer/collectors'
import { defineRule } from '../../rule'

interface Canonical {
  readonly source: 'link' | 'header'
  /** As written. */
  readonly href: string
  /** Resolved, without the fragment. */
  readonly url: string
  readonly selector?: string
  readonly snippet?: string
  readonly location?: SourceLocation
}

export const rule = defineRule({
  id: 'canonical-conflict',
  version: '1.0.0',
  category: 'index',
  severity: 'serious',
  needs: ['http'],
  messages: ['multiple-tags', 'header-mismatch', 'multiple-headers'],
  appliesTo: (page) => canonicals(page).length > 0,
  detect: ({ page }) => {
    const all = canonicals(page)
    const tags = all.filter((canonical) => canonical.source === 'link')
    const headers = all.filter((canonical) => canonical.source === 'header')
    if (new Set(all.map((canonical) => canonical.url)).size < 2) return []
    const listed = all.map(({ source, href, url }) => ({ source, href, url }))
    const [firstTag] = tags
    const [firstHeader] = headers
    const tagConflict = tags.find((tag) => tag.url !== firstTag?.url)
    if (firstTag !== undefined && firstHeader !== undefined && tagConflict === undefined) {
      const differing = headers.find((header) => header.url !== firstTag.url) ?? firstHeader
      return [
        {
          message: 'header-mismatch',
          values: { headerUrl: differing.url, tagUrl: firstTag.url, canonicals: listed },
          ...where(firstTag),
        },
      ]
    }
    if (tagConflict !== undefined) {
      return [{ message: 'multiple-tags', values: { canonicals: listed }, ...where(tagConflict) }]
    }
    return [{ message: 'multiple-headers', values: { canonicals: listed } }]
  },
})

/** Google reads rel=canonical from <head> and from the Link header; one in <body> is ignored. */
function canonicals(page: PageFacts): Canonical[] {
  const tags = (page.html?.links ?? [])
    .filter((link) => link.inHead && link.rel.includes('canonical') && link.url !== null)
    .map((link) => ({
      source: 'link' as const,
      href: link.href ?? '',
      url: withoutFragment(link.url ?? ''),
      selector: link.selector,
      ...(link.snippet === null ? {} : { snippet: link.snippet }),
      ...(link.location === null ? {} : { location: link.location }),
    }))
  const headers = page.linkHeaders
    .filter((entry) => entry.rel.includes('canonical') && entry.url !== null)
    .map((entry) => ({
      source: 'header' as const,
      href: entry.target,
      url: withoutFragment(entry.url ?? ''),
    }))
  return [...tags, ...headers]
}

function where(canonical: Canonical) {
  return {
    ...(canonical.selector === undefined ? {} : { selector: canonical.selector }),
    ...(canonical.snippet === undefined ? {} : { snippet: canonical.snippet }),
    ...(canonical.location === undefined ? {} : { location: canonical.location }),
  }
}

function withoutFragment(url: string): string {
  const parsed = new URL(url)
  parsed.hash = ''
  return parsed.href
}
