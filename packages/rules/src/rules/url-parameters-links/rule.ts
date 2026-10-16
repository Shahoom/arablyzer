import type { AnchorElement } from '@arablyzer/collectors'
import { organizationalDomain } from '@arablyzer/collectors'
import { SESSION, TRACKING } from '../../lib/url-params'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'tracking' | 'session' | 'own-url'

function hostKey(url: URL): string {
  return (organizationalDomain(url.hostname) ?? url.hostname).toLowerCase()
}

interface Hit {
  readonly anchor: AnchorElement
  readonly param: string
  readonly kind: 'tracking' | 'session'
}

/**
 * M6.1: the page's links to its own site that carry a tracking or session parameter
 * (`?utm_source=…`, `?PHPSESSID=…`): each such link is another address for the same page, which
 * crawlers meet as duplicates and analytics counts as a new visit from "outside". And the page
 * itself, fetched with such parameters, whose canonical address keeps them or is missing. One
 * finding for each parameter, with how many links and the first.
 */
export const rule = defineRule({
  id: 'url-parameters-links',
  version: '1.0.0',
  category: 'crawl',
  severity: 'moderate',
  needs: ['html'],
  messages: ['tracking', 'session', 'own-url'],
  appliesTo: (page) => (page.html?.anchors.length ?? 0) > 0,
  detect: ({ page }): DetectorFinding<Message>[] => {
    const html = page.html
    if (html === null) return []
    let own: URL
    try {
      own = new URL(page.url)
    } catch {
      return []
    }
    const hits: Hit[] = []
    for (const anchor of html.anchors) {
      if (anchor.url === null) continue
      let target: URL
      try {
        target = new URL(anchor.url)
      } catch {
        continue
      }
      if (!/^https?:$/.test(target.protocol) || hostKey(target) !== hostKey(own)) continue
      for (const name of new Set(target.searchParams.keys())) {
        if (TRACKING.test(name)) hits.push({ anchor, param: name.toLowerCase(), kind: 'tracking' })
        else if (SESSION.test(name))
          hits.push({ anchor, param: name.toLowerCase(), kind: 'session' })
      }
    }
    const findings: DetectorFinding<Message>[] = []
    const byParam = new Map<string, Hit[]>()
    for (const hit of hits) byParam.set(hit.param, [...(byParam.get(hit.param) ?? []), hit])
    for (const [param, group] of byParam) {
      const [first] = group
      if (first === undefined) continue
      findings.push({
        message: first.kind,
        values: { param, count: group.length, href: first.anchor.href },
        selector: first.anchor.selector,
        ...(first.anchor.snippet === null ? {} : { snippet: first.anchor.snippet }),
        ...(first.anchor.location === null ? {} : { location: first.anchor.location }),
        key: param,
      })
    }
    const ownParams = [...new Set(own.searchParams.keys())].filter(
      (name) => TRACKING.test(name) || SESSION.test(name),
    )
    if (ownParams.length > 0) {
      const canonical = html.links.find((link) => link.rel.includes('canonical'))?.url ?? null
      if (canonical === null || keepsParameters(canonical, ownParams)) {
        findings.push({
          message: 'own-url',
          values: { params: ownParams.join(', '), canonical: canonical ?? '' },
          key: 'own',
        })
      }
    }
    return findings
  },
})

/** Whether a canonical address still carries one of the parameters the page was reached with. */
function keepsParameters(canonical: string, params: readonly string[]): boolean {
  try {
    return [...new URL(canonical).searchParams.keys()].some((name) => params.includes(name))
  } catch {
    return false
  }
}
