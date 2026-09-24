/** A user-agent line of a group. */
export interface RobotsAgent {
  /** As written. */
  readonly value: string
  /** The product token ([A-Za-z_-] prefix), lowercased; '' for `*`. */
  readonly product: string
  readonly global: boolean
  readonly line: number
}

export interface RobotsRule {
  readonly type: 'allow' | 'disallow'
  /** Path pattern ready for matching: non-ASCII bytes percent-encoded, escapes upper-cased. */
  readonly pattern: string
  /** The line as written (UTF-8, comment removed), for evidence. */
  readonly text: string
  readonly line: number
}

export interface RobotsGroup {
  readonly agents: readonly RobotsAgent[]
  readonly rules: readonly RobotsRule[]
}

export interface RobotsTxt {
  readonly groups: readonly RobotsGroup[]
  readonly sitemaps: readonly string[]
}

/** How the robots.txt fetch ended, in RFC 9309 terms. */
export type RobotsFacts =
  | {
      readonly outcome: 'fetched'
      readonly url: string
      readonly status: number
      readonly robots: RobotsTxt
      /** Cut at the parse limit (RFC 9309: at least 500 KiB). */
      readonly truncated: boolean
    }
  /** 4xx (except 429), or too many redirects: crawlers may access everything. */
  | { readonly outcome: 'unavailable'; readonly url: string; readonly status: number | null }
  /** 5xx, 429 or a network failure: crawlers must assume everything is disallowed. */
  | {
      readonly outcome: 'unreachable'
      readonly url: string
      readonly status: number | null
      readonly reason: 'server-error' | 'network'
    }
  /** Arablyzer could not check (e.g. a redirect to a blocked address): no verdict. */
  | { readonly outcome: 'failed'; readonly url: string; readonly code: string }

export interface RobotsInput {
  readonly url: string
  /** The final response, or null when the fetch failed. */
  readonly response: {
    readonly status: number
    readonly body: Uint8Array
    readonly truncated: boolean
  } | null
  /** The @arablyzer/egress error code when the fetch failed. */
  readonly errorCode: string | null
}

/** Egress codes that mean the server could not be reached. */
const NETWORK_ERRORS = new Set(['timeout', 'connect-failed', 'dns-failed', 'tls-failed'])

export function collectRobots(input: RobotsInput): RobotsFacts {
  const { url, response, errorCode } = input
  if (response === null) {
    // RFC 9309 §2.3.1.2 and Google: past five redirects, robots.txt counts as unavailable.
    if (errorCode === 'too-many-redirects') return { outcome: 'unavailable', url, status: null }
    if (errorCode !== null && NETWORK_ERRORS.has(errorCode)) {
      return { outcome: 'unreachable', url, status: null, reason: 'network' }
    }
    return { outcome: 'failed', url, code: errorCode ?? 'no-response' }
  }
  const { status } = response
  if (status >= 200 && status < 300) {
    return {
      outcome: 'fetched',
      url,
      status,
      robots: parseRobotsTxt(response.body),
      truncated: response.truncated,
    }
  }
  // Google treats 429 like a server error.
  if (status === 429 || status >= 500)
    return { outcome: 'unreachable', url, status, reason: 'server-error' }
  if (status >= 300) return { outcome: 'unavailable', url, status }
  return { outcome: 'failed', url, code: 'unexpected-status' }
}

/** Google's parser truncates longer lines (robots.cc: kMaxLineLen = 2083 * 8). */
const MAX_LINE_LENGTH = 2083 * 8

type Key = 'user-agent' | 'allow' | 'disallow' | 'sitemap'

/**
 * Parses robots.txt as RFC 9309 describes, with the leniency of Google's open-source parser:
 * common key typos, whitespace instead of a missing colon, and a UTF-8 BOM. Works on bytes, so
 * paths are matched byte for byte as Google does.
 */
export function parseRobotsTxt(body: Uint8Array): RobotsTxt {
  const start = body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf ? 3 : 0
  const bytes = Buffer.from(body.buffer, body.byteOffset + start, body.length - start)
  const groups: { agents: RobotsAgent[]; rules: RobotsRule[] }[] = []
  const sitemaps: string[] = []
  let current: { agents: RobotsAgent[]; rules: RobotsRule[] } | null = null
  let sawRule = false

  let lineNumber = 0
  for (const line of lines(bytes.toString('latin1'))) {
    lineNumber++
    const parsed = keyAndValue(line)
    if (parsed === null) continue
    const { key, value, text } = parsed
    if (key === 'user-agent') {
      if (current === null || sawRule) {
        current = { agents: [], rules: [] }
        groups.push(current)
        sawRule = false
      }
      const global = value.startsWith('*') && (value.length === 1 || isSpace(value.charAt(1)))
      current.agents.push({
        value: utf8(value),
        product: global ? '' : productToken(value).toLowerCase(),
        global,
        line: lineNumber,
      })
    } else if (key === 'sitemap') {
      if (value !== '') sitemaps.push(utf8(value))
    } else if (current !== null) {
      sawRule = true
      if (value === '') continue
      const pattern = escapePattern(value)
      current.rules.push({ type: key, pattern, text: utf8(text), line: lineNumber })
      const slash = pattern.lastIndexOf('/')
      if (key === 'allow' && slash !== -1 && pattern.startsWith('/index.htm', slash)) {
        // Google: allowing /dir/index.html also allows /dir/ itself.
        current.rules.push({
          type: 'allow',
          pattern: `${pattern.slice(0, slash + 1)}$`,
          text: utf8(text),
          line: lineNumber,
        })
      }
    }
  }
  return { groups, sitemaps }
}

function* lines(text: string): Generator<string> {
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i)
    if (char !== '\n' && char !== '\r') continue
    yield text.slice(start, Math.min(i, start + MAX_LINE_LENGTH))
    if (char === '\r' && text.charAt(i + 1) === '\n') i++
    start = i + 1
  }
  if (start < text.length) yield text.slice(start, start + MAX_LINE_LENGTH)
}

function keyAndValue(raw: string): { key: Key; value: string; text: string } | null {
  const hash = raw.indexOf('#')
  const line = trim(hash === -1 ? raw : raw.slice(0, hash))
  let separator = line.indexOf(':')
  let valueStart = separator + 1
  if (separator === -1) {
    // Google: people forget the colon; accept whitespace when the line has exactly two words.
    const match = /[ \t]+/.exec(line)
    if (match === null) return null
    separator = match.index
    valueStart = match.index + match[0].length
    if (/[ \t]/.test(line.slice(valueStart))) return null
  }
  const name = trim(line.slice(0, separator))
  if (name === '') return null
  const key = classify(name.toLowerCase())
  if (key === null) return null
  return { key, value: trim(line.slice(valueStart)), text: line }
}

const KEYS: readonly (readonly [Key, readonly string[]])[] = [
  ['user-agent', ['user-agent', 'useragent', 'user agent']],
  ['allow', ['allow']],
  ['disallow', ['disallow', 'dissallow', 'dissalow', 'disalow', 'diasllow', 'disallaw']],
  ['sitemap', ['sitemap', 'site-map']],
]

/** Google matches keys by prefix, so "user-agents" still counts. */
function classify(name: string): Key | null {
  for (const [key, spellings] of KEYS) {
    if (spellings.some((spelling) => name.startsWith(spelling))) return key
  }
  return null
}

/** Google's ExtractUserAgent: the leading run of [A-Za-z_-]. */
function productToken(value: string): string {
  return /^[A-Za-z_-]*/.exec(value)?.[0] ?? ''
}

/** Google's MaybeEscapePattern, on a byte string: %XX for bytes ≥ 0x80, upper-case hex in escapes. */
function escapePattern(value: string): string {
  let out = ''
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (value.charAt(i) === '%' && isHex(value.charAt(i + 1)) && isHex(value.charAt(i + 2))) {
      out += `%${value.slice(i + 1, i + 3).toUpperCase()}`
      i += 2
    } else if (code >= 0x80) {
      out += `%${code.toString(16).toUpperCase().padStart(2, '0')}`
    } else {
      out += value.charAt(i)
    }
  }
  return out
}

function isHex(char: string): boolean {
  return /^[0-9A-Fa-f]$/.test(char)
}

function isSpace(char: string): boolean {
  return ' \t\n\v\f\r'.includes(char)
}

function trim(value: string): string {
  return value.replace(/^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/g, '')
}

/** Byte strings back to text for display; invalid UTF-8 shows as U+FFFD. */
function utf8(binary: string): string {
  return Buffer.from(binary, 'latin1').toString('utf8')
}
