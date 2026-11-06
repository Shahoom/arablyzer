// The redirect planner and the redirect generator (M10.1): a list of "from → to" pairs read, flattened
// (a chain A→B→C becomes A→C and B→C), checked for loops and clashes, and written for a server.
// A path in the config is written as the server reads it (decoded, so an Arabic path is Arabic);
// a target is percent-encoded. Nothing that could end a line, a quote or a block in a config is allowed in.

export type RedirectProblem =
  'unreadable' | 'same' | 'clash' | 'loop' | 'chain' | 'unsafe' | 'duplicate' | 'other-host'

export interface RedirectPair {
  /** A path from the root, decoded. */
  readonly from: string
  /** A path from the root (decoded) or a full address (as encoded). */
  readonly to: string
}

export interface RedirectPlan {
  readonly pairs: readonly RedirectPair[]
  readonly problems: readonly {
    readonly line: number
    readonly problem: RedirectProblem
    readonly text: string
  }[]
  /** How many pairs were chains, now going straight to the end. */
  readonly flattened: number
}

/** Characters no config may be given: controls, spaces, quotes, braces, a semicolon, backslash, `$`, `%`, `#`. */
const UNSAFE = /[\s\p{Cc}"'`{}();\\$%#<>|^]/u

/** What a path rule cannot match or a config reads as a pattern: a query, a wildcard, a parameter, brackets. */
const FROM_UNSAFE = /[?*:[\]]/u

function normalise(value: string): { path: string; origin: string | null } | null {
  const text = value.trim()
  if (text === '') return null
  try {
    const url = /^https?:\/\//i.test(text)
      ? new URL(text)
      : new URL(text.startsWith('/') ? text : `/${text}`, 'https://page.invalid')
    const origin = /^https?:\/\//i.test(text) ? url.origin : null
    let path =
      decodeURIComponent(url.pathname) + (url.search === '' ? '' : decodeURIComponent(url.search))
    if (path.length > 1) path = path.replace(/\/+$/, '') || '/'
    return { path, origin }
  } catch {
    return null
  }
}

/** Lines of "from to", separated by a space, a tab, a comma or an arrow. */
export function planRedirects(input: string): RedirectPlan {
  const problems: { line: number; problem: RedirectProblem; text: string }[] = []
  const map = new Map<string, string>()
  const lineOf = new Map<string, number>()
  let host: string | null = null
  input.split(/\r?\n/).forEach((raw, index) => {
    const text = raw.trim()
    if (text === '' || text.startsWith('#')) return
    const line = index + 1
    const parts = text.split(/\s*(?:->|=>|→|,|\t)\s*|\s+/).filter((part) => part !== '')
    if (parts.length < 2) {
      problems.push({ line, problem: 'unreadable', text })
      return
    }
    const from = normalise(parts[0] ?? '')
    const to = normalise(parts[1] ?? '')
    if (from === null || to === null) {
      problems.push({ line, problem: 'unreadable', text })
      return
    }
    for (const origin of [from.origin, to.origin]) {
      if (origin === null) continue
      host ??= origin
      if (origin !== host) {
        problems.push({ line, problem: 'other-host', text })
        return
      }
    }
    if (UNSAFE.test(from.path) || UNSAFE.test(to.path) || FROM_UNSAFE.test(from.path)) {
      problems.push({ line, problem: 'unsafe', text })
      return
    }
    if (from.path === to.path) {
      problems.push({ line, problem: 'same', text })
      return
    }
    const known = map.get(from.path)
    if (known !== undefined) {
      problems.push({ line, problem: known === to.path ? 'duplicate' : 'clash', text })
      return
    }
    map.set(from.path, to.path)
    lineOf.set(from.path, line)
  })
  // Follow each from to its end; a path met twice on the way is a loop.
  const pairs: RedirectPair[] = []
  let flattened = 0
  for (const [from, first] of map) {
    const seen = new Set([from])
    let end = first
    let hops = 1
    let loop = false
    while (map.has(end)) {
      if (seen.has(end)) {
        loop = true
        break
      }
      seen.add(end)
      end = map.get(end) ?? end
      hops++
    }
    const line = lineOf.get(from) ?? 0
    if (loop) {
      problems.push({ line, problem: 'loop', text: `${from} → ${first}` })
      continue
    }
    if (hops > 1) {
      flattened++
      problems.push({ line, problem: 'chain', text: `${from} → ${first} → … → ${end}` })
    }
    pairs.push({ from, to: end })
  }
  problems.sort((a, b) => a.line - b.line)
  return { pairs, problems, flattened }
}

export type RedirectTarget = 'apache' | 'nginx' | 'redirects-file' | 'vercel'
export type RedirectStatus = 301 | 302 | 307 | 308

const encodePath = (path: string) =>
  path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

/** A target as the server sends it: a path or a full address, percent-encoded, with its query kept. */
function targetOf(to: string, origin: string | null): string {
  const query = to.indexOf('?')
  const path = query === -1 ? to : to.slice(0, query)
  const search = query === -1 ? '' : to.slice(query)
  return `${origin ?? ''}${encodePath(path)}${search === '' ? '' : encodeURI(search)}`
}

const regexEscape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The pairs as a server's config: the same redirects, written for one of four places. */
export function redirectConfig(
  pairs: readonly RedirectPair[],
  target: RedirectTarget,
  status: RedirectStatus,
  origin: string | null = null,
): string {
  if (target === 'apache') {
    return `${pairs
      .map(
        ({ from, to }) =>
          `RedirectMatch ${String(status)} "^${regexEscape(from)}/?$" "${targetOf(to, origin)}"`,
      )
      .join('\n')}\n`
  }
  if (target === 'nginx') {
    return `${pairs
      .map(
        ({ from, to }) =>
          `location = ${from} { return ${String(status)} ${targetOf(to, origin)}; }`,
      )
      .join('\n')}\n`
  }
  if (target === 'redirects-file') {
    return `${pairs.map(({ from, to }) => `${encodePath(from)} ${targetOf(to, origin)} ${String(status)}`).join('\n')}\n`
  }
  return `${JSON.stringify(
    {
      redirects: pairs.map(({ from, to }) => ({
        source: encodePath(from),
        destination: targetOf(to, origin),
        statusCode: status,
      })),
    },
    null,
    2,
  )}\n`
}
