import { headerValues } from '@arablyzer/collectors'
import { forbidsIndexing, metaDirectives, xRobotsTagDirectives } from '../../lib/robots-directives'
import { defineRule, type DetectorFinding } from '../../rule'

/** Crawlers whose rules decide Google web search: all of them, or Googlebot by name. */
const GOOGLE_WEB_SEARCH = new Set(['robots', 'googlebot'])

type Message = 'meta' | 'header'

export const rule = defineRule({
  id: 'page-noindex',
  version: '1.0.0',
  category: 'index',
  severity: 'critical',
  needs: ['http'],
  messages: ['meta', 'header'],
  appliesTo: () => true,
  detect: ({ page }) => {
    const findings: DetectorFinding<Message>[] = []
    for (const meta of page.html?.metas ?? []) {
      if (meta.name === null || !GOOGLE_WEB_SEARCH.has(meta.name) || meta.content === null) continue
      const directive = metaDirectives(meta.content).find(forbidsIndexing)
      if (directive === undefined) continue
      findings.push({
        message: 'meta',
        values: { name: meta.name, content: meta.content, directive },
        selector: meta.selector,
        ...(meta.snippet === null ? {} : { snippet: meta.snippet }),
        ...(meta.location === null ? {} : { location: meta.location }),
        key: `meta:${meta.content}`,
      })
    }
    for (const value of headerValues(page.headers, 'x-robots-tag')) {
      const directive = xRobotsTagDirectives(value).find(
        (scoped) =>
          (scoped.agent === null || scoped.agent === 'googlebot') &&
          forbidsIndexing(scoped.directive),
      )
      if (directive === undefined) continue
      findings.push({
        message: 'header',
        snippet: `X-Robots-Tag: ${value}`,
        values: { value, directive: directive.directive },
        key: `header:${value}`,
      })
    }
    return findings
  },
})
