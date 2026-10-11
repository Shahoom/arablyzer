/**
 * The rules that judge the server's response rather than the page: its scheme and certificate,
 * its security headers, its redirects, a bot challenge in place of the page, and an error page that
 * answers 200, which the site's server or the service in front of it sets, not its HTML (a built
 * 404 page is read by the self-audit as a page with status 200). The site's
 * pages say so, and its self-audit, which reads the built HTML alone, leaves them to the live site.
 */
export const SERVER_RESPONSE_RULES: ReadonlySet<string> = new Set([
  'https-missing',
  'tls-expiring',
  'hsts-missing',
  'csp-missing',
  'x-content-type-options-missing',
  'frame-protection-missing',
  'referrer-policy-missing',
  'redirect-chain',
  'redirect-temporary',
  'bot-challenge',
  'soft-404-signals',
])
