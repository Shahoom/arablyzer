import type { FindingEvidence } from '@arablyzer/report-schema'

// How two findings of two reports are told to be the same one (M4.6). The report's own
// fingerprint hashes the rule and the exact location, so a line that moved a little breaks it;
// here the selector and the address are read for what they point at.

export const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** Query parameters that only say where a visitor came from. */
const TRACKING = /^(?:utm_|fbclid$|gclid$|msclkid$|mc_eid$)/i
const SNIPPET_KEY = 120

/** An address without its scheme, fragment, trailing slash and tracking parameters; a text that is not one, collapsed. */
export function addressKey(raw: string): string {
  try {
    const url = new URL(raw)
    const params = [...url.searchParams]
      .filter(([name]) => !TRACKING.test(name))
      .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
    const query = new URLSearchParams(params).toString()
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname
    return `${url.host.toLowerCase()}${path}${query === '' ? '' : `?${query}`}`
  } catch {
    return collapse(raw)
  }
}

export interface Locator {
  /** What two findings must share to be the same finding (with the rule). */
  readonly key: string
  /** What the page shows the person: the selector, the address, or the snippet; null for the whole page. */
  readonly label: string | null
}

export function locatorOf(evidence: FindingEvidence): Locator {
  const selector = evidence.selector === undefined ? '' : collapse(evidence.selector)
  const address = evidence.url === undefined ? '' : addressKey(evidence.url)
  // The snippet only stands in when nothing points at the finding.
  const snippet =
    selector === '' && address === ''
      ? collapse(evidence.snippet ?? '')
          .toLowerCase()
          .slice(0, SNIPPET_KEY)
      : ''
  const label =
    selector !== ''
      ? selector
      : (evidence.url ??
        (snippet === '' ? null : collapse(evidence.snippet ?? '').slice(0, SNIPPET_KEY)))
  return { key: `${selector}\u0001${address}\u0001${snippet}`, label }
}
