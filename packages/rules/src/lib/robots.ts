import type { RobotsFacts, RobotsRule, RobotsTxt } from '@arablyzer/collectors'

export interface RobotsMatch {
  readonly allowed: boolean
  /** The rule that decided; null when no rule matched (allowed). */
  readonly rule: RobotsRule | null
  /** The crawler's own group(s), the `*` group(s), or none at all. */
  readonly group: 'specific' | 'global' | 'none'
}

/**
 * RFC 9309 §2.2 as Google implements it (google/robotstxt): the groups naming the crawler's
 * product token win over `*` and are merged; the longest matching pattern wins; an allow wins a
 * tie; `*` matches any run of characters and a final `$` anchors the end.
 */
export function matchRobots(robots: RobotsTxt, product: string, url: string): RobotsMatch {
  const token = product.toLowerCase()
  const specific = robots.groups.filter((group) =>
    group.agents.some((agent) => !agent.global && agent.product !== '' && agent.product === token),
  )
  const global = robots.groups.filter((group) => group.agents.some((agent) => agent.global))
  const [groups, kind] =
    specific.length > 0
      ? ([specific, 'specific'] as const)
      : global.length > 0
        ? ([global, 'global'] as const)
        : ([[], 'none'] as const)
  const path = robotsPath(url)
  // RFC 9309 §2.2.2: /robots.txt itself is always allowed.
  if (path === '/robots.txt') return { allowed: true, rule: null, group: kind }

  let allow: RobotsRule | null = null
  let disallow: RobotsRule | null = null
  for (const group of groups) {
    for (const rule of group.rules) {
      if (!patternMatches(path, rule.pattern)) continue
      if (rule.type === 'allow') {
        if (allow === null || rule.pattern.length > allow.pattern.length) allow = rule
      } else if (disallow === null || rule.pattern.length > disallow.pattern.length) {
        disallow = rule
      }
    }
  }
  if (disallow !== null && (allow === null || disallow.pattern.length > allow.pattern.length)) {
    return { allowed: false, rule: disallow, group: kind }
  }
  return { allowed: true, rule: allow, group: kind }
}

/** Path and query as crawlers match them, with percent-escapes upper-cased like the patterns. */
export function robotsPath(url: string): string {
  const parsed = new URL(url)
  return `${parsed.pathname}${parsed.search}`.replace(/%[0-9a-f]{2}/gi, (escape) =>
    escape.toUpperCase(),
  )
}

/** Google's RobotsMatchStrategy::Matches: a set of candidate positions, linear in the path. */
export function patternMatches(path: string, pattern: string): boolean {
  let positions = [0]
  for (let p = 0; p < pattern.length; p++) {
    const char = pattern.charAt(p)
    if (char === '$' && p === pattern.length - 1) return positions.at(-1) === path.length
    if (char === '*') {
      const first = positions[0] ?? 0
      positions = Array.from({ length: path.length - first + 1 }, (_, i) => first + i)
      continue
    }
    const next: number[] = []
    for (const position of positions) {
      if (position < path.length && path.charAt(position) === char) next.push(position + 1)
    }
    if (next.length === 0) return false
    positions = next
  }
  return true
}

export type CrawlerAccess =
  | { readonly basis: 'rules'; readonly allowed: boolean; readonly match: RobotsMatch }
  /** robots.txt is unavailable (4xx): everything is allowed. */
  | { readonly basis: 'unavailable'; readonly allowed: true }
  /** robots.txt is unreachable (5xx, 429, network): everything is disallowed. */
  | { readonly basis: 'unreachable'; readonly allowed: false }

/** Whether a crawler may fetch the URL; null when Arablyzer could not check robots.txt. */
export function crawlerAccess(
  facts: RobotsFacts,
  product: string,
  url: string,
): CrawlerAccess | null {
  switch (facts.outcome) {
    case 'fetched': {
      const match = matchRobots(facts.robots, product, url)
      return { basis: 'rules', allowed: match.allowed, match }
    }
    case 'unavailable':
      return { basis: 'unavailable', allowed: true }
    case 'unreachable':
      return { basis: 'unreachable', allowed: false }
    case 'failed':
      return null
  }
}
