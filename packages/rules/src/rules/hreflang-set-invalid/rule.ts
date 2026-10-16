import { alternates, identity, isAbsolute, selfEntry, type Alternate } from '../../lib/hreflang-set'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'relative-url' | 'self-missing' | 'duplicate-code'

/**
 * M6.1: the set of hreflang links of a page, as Google asks: each address is a full one (with its
 * scheme), the page lists itself among them, and no language is given two addresses. The page
 * itself is told by its canonical address; when none of the links is on the page's own host the
 * scan cannot tell which one it is (a proxy, a staging name), and does not judge that.
 */
export const rule = defineRule({
  id: 'hreflang-set-invalid',
  version: '1.0.0',
  category: 'intl',
  severity: 'moderate',
  needs: ['html'],
  messages: ['relative-url', 'self-missing', 'duplicate-code'],
  appliesTo: (page) => alternates(page).length > 0,
  detect: ({ page }): DetectorFinding<Message>[] => {
    const found = alternates(page)
    const findings: DetectorFinding<Message>[] = []
    const point = (alternate: Alternate) => ({
      selector: alternate.link.selector,
      ...(alternate.link.snippet === null ? {} : { snippet: alternate.link.snippet }),
      ...(alternate.link.location === null ? {} : { location: alternate.link.location }),
    })
    for (const alternate of found) {
      const href = alternate.link.href ?? ''
      if (href === '' || !isAbsolute(href)) {
        findings.push({
          message: 'relative-url',
          values: { hreflang: alternate.code, href },
          ...point(alternate),
          key: `${alternate.code}:${href}`,
        })
      }
    }
    const self = selfEntry(page, found)
    const [first] = found
    if (self === null && first !== undefined) {
      findings.push({
        message: 'self-missing',
        values: {
          address:
            identity(page.html?.links.find((l) => l.rel.includes('canonical'))?.url ?? null) ??
            identity(page.url) ??
            page.url,
        },
        ...point(first),
        key: 'self',
      })
    }
    const byCode = new Map<string, Alternate[]>()
    for (const alternate of found) {
      const code = alternate.code.toLowerCase()
      byCode.set(code, [...(byCode.get(code) ?? []), alternate])
    }
    for (const [code, same] of byCode) {
      const urls = new Set(
        same.map((alternate) => identity(alternate.link.url) ?? alternate.link.href),
      )
      const second = same[1]
      if (urls.size > 1 && second !== undefined) {
        findings.push({
          message: 'duplicate-code',
          values: { hreflang: code, count: urls.size },
          ...point(second),
          key: code,
        })
      }
    }
    return findings
  },
})
