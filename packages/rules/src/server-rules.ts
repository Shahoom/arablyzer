/**
 * The rules that judge the server's response rather than the page: its scheme and certificate,
 * its security headers, its redirects, and a bot challenge in place of the page, which the site's
 * server or the service in front of it sets, not its HTML. The site's
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
])
