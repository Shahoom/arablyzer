import type { LinkElement, PageFacts } from '@arablyzer/collectors'

/** One `<link rel="alternate" hreflang>` of the page's head. */
export interface Alternate {
  readonly code: string
  readonly link: LinkElement
}

/** The page's hreflang annotations in `<link>` elements, in document order. */
export function alternates(page: PageFacts): Alternate[] {
  return (page.html?.links ?? []).flatMap((link): Alternate[] =>
    link.rel.includes('alternate') && link.hreflang !== null && link.hreflang.trim() !== ''
      ? [{ code: link.hreflang.trim(), link }]
      : [],
  )
}

/**
 * An address as the page's identity: scheme and host in lowercase, the path without a trailing
 * slash, no query and no fragment. Null for what does not parse.
 */
export function identity(url: string | null): string | null {
  if (url === null) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    const path = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, '') : parsed.pathname
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}`
  } catch {
    return null
  }
}

function hostOf(identified: string): string {
  return new URL(identified).host
}

/**
 * Which alternate is the page itself: the one whose address is the page's canonical address, or its
 * own where it has none. `null` when none is (the page does not list itself), `'unknown'` when no
 * alternate is on the page's host, so the scan cannot tell which one the page is (it was fetched
 * under another name, a proxy or a staging host).
 */
export function selfEntry(
  page: PageFacts,
  found: readonly Alternate[],
): Alternate | null | 'unknown' {
  const canonical = page.html?.links.find((link) => link.rel.includes('canonical'))?.url ?? null
  const mine = identity(canonical) ?? identity(page.url)
  if (mine === null) return 'unknown'
  const sameHost = found.filter((alternate) => {
    const other = identity(alternate.link.url)
    return other !== null && hostOf(other) === hostOf(mine)
  })
  if (sameHost.length === 0) return 'unknown'
  return sameHost.find((alternate) => identity(alternate.link.url) === mine) ?? null
}

/** An address with its scheme, as Google asks of hreflang. */
export function isAbsolute(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href.trim())
}
