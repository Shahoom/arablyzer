import { isPublicUrl } from '../../lib/hosts'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'none' | 'html'

/**
 * A public site without a sitemap: robots.txt names none as a full URL, and /sitemap.xml, where the
 * protocol's example puts one, answers with an error status or with an HTML page (a site that
 * answers every address with a page). Google says most sites benefit from a sitemap, and finds a
 * well-linked site's pages without one: a minor fault. What a sitemap holds is sitemap-invalid's.
 */
export const rule = defineRule({
  id: 'sitemap-missing',
  version: '1.0.0',
  category: 'crawl',
  severity: 'minor',
  needs: ['robots', 'sitemap'],
  messages: ['none', 'html'],
  appliesTo: (page) => isPublicUrl(page.url),
  detect: ({ sitemap }): DetectorFinding<Message>[] => {
    // The engine looks at /sitemap.xml only when robots.txt names no sitemap as a full URL.
    const probe = sitemap?.checked.find((check) => !check.named)
    if (probe === undefined) return []
    if (probe.outcome === 'unavailable') {
      return [{ message: 'none', url: probe.url, values: { url: probe.url, status: probe.status } }]
    }
    if (probe.content.kind === 'html') {
      return [{ message: 'html', url: probe.url, values: { url: probe.url } }]
    }
    return []
  },
})
