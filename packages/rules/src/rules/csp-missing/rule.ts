import { headerValues } from '@arablyzer/collectors'
import { headerPolicies, isPolicyMeta, metaPolicy } from '../../lib/csp'
import { isPublicUrl } from '../../lib/hosts'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'missing' | 'report-only' | 'meta-ignored'

/**
 * A public HTML page that enforces no Content-Security-Policy: nothing tells browsers which
 * scripts and other resources it may load, the main defence against cross-site scripting. A
 * policy counts from the header, or from a <meta http-equiv> in <head>, as browsers read them;
 * one that only reports (Report-Only) blocks nothing. Whether the policy is strict is not judged.
 */
export const rule = defineRule({
  id: 'csp-missing',
  version: '1.0.0',
  category: 'trust',
  severity: 'minor',
  needs: ['headers', 'html'],
  messages: ['missing', 'report-only', 'meta-ignored'],
  appliesTo: (page) => page.html !== null && isPublicUrl(page.url),
  detect: ({ page }): DetectorFinding<Message>[] => {
    const metas = (page.html?.metas ?? []).filter(isPolicyMeta)
    if (headerPolicies(page).length > 0 || metas.some((meta) => metaPolicy(meta) !== null)) {
      return []
    }
    const findings: DetectorFinding<Message>[] = []
    if (headerPolicies(page, 'report').length > 0) {
      const value = headerValues(page.headers, 'content-security-policy-report-only').join(', ')
      findings.push({
        message: 'report-only',
        snippet: `Content-Security-Policy-Report-Only: ${value}`,
      })
    }
    for (const meta of metas) {
      findings.push({
        message: 'meta-ignored',
        selector: meta.selector,
        ...(meta.snippet === null ? {} : { snippet: meta.snippet }),
        ...(meta.location === null ? {} : { location: meta.location }),
        key: meta.selector,
      })
    }
    return findings.length > 0 ? findings : [{ message: 'missing' }]
  },
})
