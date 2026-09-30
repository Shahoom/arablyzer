import { linkUrl } from '@arablyzer/collectors'
import { defineRule, type DetectorFinding } from '../../rule'

/**
 * A link on the page to its own site whose address answers an error (M2.3c): 4xx or 5xx to the
 * engine's GET, which it asks when HEAD answers one or fails to connect, as a visitor's browser
 * would. A redirect is an answer, and not followed. A link without an answer is not judged: a
 * timeout, and the refusals by which a site turns away a visitor it takes for a bot (401, 403, 407,
 * 429 and 503), which the engine does not report as answers. Each address once, at the first link
 * to it; the finding points at that link.
 */
export const rule = defineRule({
  id: 'link-broken',
  version: '1.0.0',
  category: 'links',
  severity: 'moderate',
  needs: ['html', 'links'],
  messages: ['broken'],
  appliesTo: (_page, evidence) => (evidence?.links?.total ?? 0) > 0,
  *detect({ page, links }): Generator<DetectorFinding<'broken'>> {
    const broken = new Map<string, number>()
    for (const check of links?.checks ?? []) {
      if (check.outcome === 'answered' && check.status >= 400) broken.set(check.url, check.status)
    }
    // Nothing answered an error: the page's anchors need not be read at all.
    if (broken.size === 0) return
    const told = new Set<string>()
    for (const anchor of page.html?.anchors ?? []) {
      const url = linkUrl(anchor.url)?.href
      const status = url === undefined ? undefined : broken.get(url)
      if (url === undefined || status === undefined || told.has(url)) continue
      told.add(url)
      yield {
        message: 'broken',
        values: { url, status },
        selector: anchor.selector,
        ...(anchor.snippet === null ? {} : { snippet: anchor.snippet }),
        ...(anchor.location === null ? {} : { location: anchor.location }),
        key: url,
      }
      // Every broken address told: the rest of the anchors say nothing more.
      if (told.size === broken.size) return
    }
  },
})
