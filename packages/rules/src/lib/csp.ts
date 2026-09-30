import { headerValues, type PageFacts, type SourceLocation } from '@arablyzer/collectors'

const UPGRADE = 'upgrade-insecure-requests'

/** Whether one serialized policy holds the directive (CSP3 "parse a serialized CSP"). */
function hasDirective(policy: string, name: string): boolean {
  return policy.split(';').some(
    (directive) =>
      directive
        .trim()
        .split(/[\t\n\f\r ]/)[0]
        ?.toLowerCase() === name,
  )
}

/**
 * Where the page asks browsers to fetch its http: resources over https: instead (the CSP directive
 * upgrade-insecure-requests, W3C Upgrade Insecure Requests §4.1, form submissions included):
 * 'header' for a Content-Security-Policy header, which covers the whole page; the location of a
 * <meta http-equiv="Content-Security-Policy"> in <head>, which covers what comes after it; null
 * when it does not. A Report-Only policy upgrades nothing, and a <meta> outside <head> is ignored.
 */
export function upgradeInsecureRequests(page: PageFacts): 'header' | SourceLocation | null {
  // One header may hold several policies, separated by commas.
  const headers = headerValues(page.headers, 'content-security-policy')
  if (headers.some((value) => value.split(',').some((policy) => hasDirective(policy, UPGRADE)))) {
    return 'header'
  }
  for (const meta of page.html?.metas ?? []) {
    if (
      meta.inHead &&
      meta.httpEquiv === 'content-security-policy' &&
      meta.location !== null &&
      hasDirective(meta.content ?? '', UPGRADE)
    ) {
      return meta.location
    }
  }
  return null
}

/** Whether an element at `location` comes after `start` in the document. */
export function comesAfter(location: SourceLocation | null, start: SourceLocation): boolean {
  if (location === null) return false
  return (
    location.line > start.line || (location.line === start.line && location.column > start.column)
  )
}
