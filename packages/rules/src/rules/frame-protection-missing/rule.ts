import { headerPolicies, isPolicyMeta, parsePolicy } from '../../lib/csp'
import { asciiLowercase, getDecodeSplit } from '../../lib/headers'
import { isPublicUrl } from '../../lib/hosts'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'missing' | 'x-frame-options-ignored' | 'meta'

/** Values of X-Frame-Options that make browsers refuse a frame when they come with another. */
const BLOCKING = ['deny', 'allowall', 'sameorigin']

/**
 * Whether browsers keep the page out of other sites' frames by its X-Frame-Options values (HTML
 * "check a navigation response's adherence to X-Frame-Options"): lowercased, as a set, one value
 * that is DENY or SAMEORIGIN, or several that include DENY, SAMEORIGIN or ALLOWALL, which the
 * browser takes for a confused attempt and blocks. ALLOW-FROM and any other lone value do nothing.
 */
function framingRefused(values: readonly string[]): boolean {
  const set = new Set(values.map(asciiLowercase))
  if (set.size > 1) return BLOCKING.some((value) => set.has(value))
  return set.has('deny') || set.has('sameorigin')
}

/**
 * A public HTML page any site may show in a frame: the ground of clickjacking, where a visitor
 * clicks the page's buttons under another site's disguise. Protected by a frame-ancestors
 * directive in an enforced Content-Security-Policy header, which browsers read before
 * X-Frame-Options, or by X-Frame-Options itself. Neither works from a <meta>.
 */
export const rule = defineRule({
  id: 'frame-protection-missing',
  version: '1.0.0',
  category: 'trust',
  severity: 'minor',
  needs: ['headers'],
  messages: ['missing', 'x-frame-options-ignored', 'meta'],
  appliesTo: (page) => page.isHtml && isPublicUrl(page.url),
  detect: ({ page }): DetectorFinding<Message>[] => {
    if (headerPolicies(page).some((policy) => policy.has('frame-ancestors'))) return []
    const values = getDecodeSplit(page.headers, 'x-frame-options')
    if (values !== null && framingRefused(values)) return []
    const findings: DetectorFinding<Message>[] = []
    if (values !== null) {
      const value = values.join(', ')
      findings.push({
        message: 'x-frame-options-ignored',
        values: { value },
        snippet: `X-Frame-Options: ${value}`,
      })
    }
    for (const meta of page.html?.metas ?? []) {
      const framing =
        meta.httpEquiv === 'x-frame-options' ||
        (isPolicyMeta(meta) && parsePolicy(meta.content ?? '').has('frame-ancestors'))
      if (!framing) continue
      findings.push({
        message: 'meta',
        selector: meta.selector,
        ...(meta.snippet === null ? {} : { snippet: meta.snippet }),
        ...(meta.location === null ? {} : { location: meta.location }),
        key: meta.selector,
      })
    }
    return findings.length > 0 ? findings : [{ message: 'missing' }]
  },
})
