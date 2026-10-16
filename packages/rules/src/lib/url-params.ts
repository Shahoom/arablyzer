/** Parameters that tell an analytics tool where a visitor came from, not what the page shows. */
export const TRACKING =
  /^(?:utm_[a-z0-9_]+|gclid|gbraid|wbraid|dclid|fbclid|msclkid|ttclid|twclid|yclid|igshid|mc_cid|mc_eid|_ga|_gl)$/i

/** Parameters that carry a visitor's session: every visitor has a different address. */
export const SESSION =
  /^(?:sessionid|session_id|sid|phpsessid|jsessionid|aspsessionid|cfid|cftoken|oscsid|zenid)$/i

/**
 * An address as the page it names: scheme and host in lowercase, the path without a trailing
 * slash, the query with its tracking and session parameters taken out and the rest in order, no
 * fragment. Null for what does not parse as an http(s) address.
 */
export function pageAddress(url: string | null): string | null {
  if (url === null) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    const path = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, '') : parsed.pathname
    const query = [...parsed.searchParams]
      .filter(([name]) => !TRACKING.test(name) && !SESSION.test(name))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, value]) => `${name}=${value}`)
      .join('&')
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${query === '' ? '' : `?${query}`}`
  } catch {
    return null
  }
}
