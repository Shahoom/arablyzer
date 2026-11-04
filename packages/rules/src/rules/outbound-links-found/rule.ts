import { organizationalDomain } from '@arablyzer/collectors'
import { defineRule, type DetectorFinding } from '../../rule'

/** The most sites listed; a page with more shows its biggest. */
const MOST = 30

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
  followed: number
  nofollow: number
  sponsored: number
  ugc: number
}

/**
 * M10.1, information alone: the sites the page links to, one finding for each, with how many links
 * and how they are marked (`nofollow`, `sponsored`, `ugc`). Never deducted: linking out is part of
 * a web page. It tells a site's owner where it sends readers and which links say they are paid for.
 */
export const rule = defineRule({
  id: 'outbound-links-found',
  version: '1.0.0',
  category: 'links',
  severity: 'info',
  needs: ['html'],
  messages: ['site'],
  appliesTo: (page) => (page.html?.anchors.length ?? 0) > 0,
  detect: ({ page }): DetectorFinding<'site'>[] => {
    const own = siteOf(hostOf(page.url) ?? '')
    const sites = new Map<string, Tally>()
    for (const anchor of page.html?.anchors ?? []) {
      const host = hostOf(anchor.url)
      if (host === null || siteOf(host) === own) continue
      const site = siteOf(host)
      const tally = sites.get(site) ?? { count: 0, followed: 0, nofollow: 0, sponsored: 0, ugc: 0 }
      tally.count++
      if (!['nofollow', 'sponsored', 'ugc'].some((token) => anchor.rel.includes(token)))
        tally.followed++
      if (anchor.rel.includes('nofollow')) tally.nofollow++
      if (anchor.rel.includes('sponsored')) tally.sponsored++
      if (anchor.rel.includes('ugc')) tally.ugc++
      sites.set(site, tally)
    }
    return [...sites]
      .sort(([a, x], [b, y]) => y.count - x.count || (a < b ? -1 : a > b ? 1 : 0))
      .slice(0, MOST)
      .map(([site, tally]) => ({
        message: 'site' as const,
        values: { site, ...tally },
        key: site,
      }))
  },
})
