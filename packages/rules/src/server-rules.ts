/**
 * The rules that judge the server's response rather than the page: its scheme and certificate,
 * its security headers and its redirects, which the site's server sets, not its HTML. The site's
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
])
