/** Rules written as "name: value", so their name is not a user agent (Google's robots meta spec). */
const RULES_WITH_VALUES = new Set([
  'max-snippet',
  'max-image-preview',
  'max-video-preview',
  'unavailable_after',
])

export interface ScopedDirective {
  /** The user agent the directive is limited to, lowercased; null for every crawler. */
  readonly agent: string | null
  /** Lowercased, e.g. "noindex" or "max-snippet: 20". */
  readonly directive: string
}

/**
 * The directives in one X-Robots-Tag value. A leading "agent:" scopes the directives after it,
 * as in "googlebot: noindex" or "otherbot: noindex, nofollow".
 */
export function xRobotsTagDirectives(value: string): ScopedDirective[] {
  const directives: ScopedDirective[] = []
  let agent: string | null = null
  for (const raw of value.split(',')) {
    let part = raw.trim()
    const prefix = /^([^\s:]+)\s*:\s*(.*)$/.exec(part)
    if (prefix !== null && !RULES_WITH_VALUES.has((prefix[1] ?? '').toLowerCase())) {
      agent = (prefix[1] ?? '').toLowerCase()
      part = (prefix[2] ?? '').trim()
    }
    if (part !== '') directives.push({ agent, directive: part.toLowerCase() })
  }
  return directives
}

/** The comma-separated rules of a robots meta tag, lowercased. */
export function metaDirectives(content: string): string[] {
  return content
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part !== '')
}

/** "none" is shorthand for "noindex, nofollow". */
export function forbidsIndexing(directive: string): boolean {
  return directive === 'noindex' || directive === 'none'
}
