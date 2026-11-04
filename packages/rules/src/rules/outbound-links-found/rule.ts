import { organizationalDomain } from '@arablyzer/collectors'
import { defineRule, type DetectorFinding } from '../../rule'

/** The most sites named in the one finding; a page with more shows its biggest and counts the rest. */
const MOST = 12

function hostOf(url: string | null): string | null {
  if (url === null) return null
  try {
    const parsed = new URL(url)
    return /^https?:$/.test(parsed.protocol) ? parsed.hostname.toLowerCase() : null
  } catch {
    return null
  }
}

const siteOf = (host: string) => organizationalDomain(host) ?? host

interface Tally {
  count: number
  nofollow: number
  sponsored: number
  ugc: number
}

/** `example.org ×3 [nofollow ×1, sponsored ×1]`: the site, its links, and how some are marked. */
function described(site: string, tally: Tally): string {
  const marks = (['nofollow', 'sponsored', 'ugc'] as const)
    .filter((mark) => tally[mark] > 0)
    .map((mark) => `${mark} ×${String(tally[mark])}`)
  return `${site} ×${String(tally.count)}${marks.length === 0 ? '' : ` [${marks.join(', ')}]`}`
}

/**
 * M10.1, information alone: the sites the page links to, in one note: how many sites and links,
 * and the biggest sites with how many links each and how some are marked (`nofollow`, `sponsored`,
 * `ugc`). Never deducted: linking out is part of a web page. It tells a site's owner where it sends
 * readers and which links say they are paid for. One note for the page, not one for each site,
 * so a page that links to many does not fill its report.
 */
export const rule = defineRule({
  id: 'outbound-links-found',
  version: '1.1.0',
  category: 'links',
  severity: 'info',
  needs: ['html'],
  messages: ['sites'],
  appliesTo: (page) => (page.html?.anchors.length ?? 0) > 0,
  detect: ({ page }): DetectorFinding<'sites'>[] => {
    const own = siteOf(hostOf(page.url) ?? '')
    const sites = new Map<string, Tally>()
    let links = 0
    for (const anchor of page.html?.anchors ?? []) {
      const host = hostOf(anchor.url)
      if (host === null || siteOf(host) === own) continue
      const site = siteOf(host)
      const tally = sites.get(site) ?? { count: 0, nofollow: 0, sponsored: 0, ugc: 0 }
      tally.count++
      links++
      if (anchor.rel.includes('nofollow')) tally.nofollow++
      if (anchor.rel.includes('sponsored')) tally.sponsored++
      if (anchor.rel.includes('ugc')) tally.ugc++
      sites.set(site, tally)
    }
    if (sites.size === 0) return []
    const biggest = [...sites].sort(
      ([a, x], [b, y]) => y.count - x.count || (a < b ? -1 : a > b ? 1 : 0),
    )
    const shown = biggest.slice(0, MOST).map(([site, tally]) => described(site, tally))
    const rest = biggest.length - MOST
    return [
      {
        message: 'sites',
        values: {
          sites: sites.size,
          links,
          list: `${shown.join('; ')}${rest > 0 ? `; +${String(rest)}` : ''}`,
        },
      },
    ]
  },
})
