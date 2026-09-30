export interface LinkHeaderEntry {
  /** The URI reference as written between < and >. */
  readonly target: string
  /** Resolved against the response URL; null when it cannot be resolved. */
  readonly url: string | null
  /** Relation types from the first rel parameter, lowercased. */
  readonly rel: readonly string[]
  readonly hreflang: string | null
  /** The entry as sent, for evidence. */
  readonly raw: string
}

const WHITESPACE = new Set([' ', '\t'])

/**
 * Parses one Link header value (RFC 8288 §3). Lenient like browsers: a malformed entry is skipped,
 * not fatal. Repeated headers are parsed one by one and concatenated by the caller.
 */
export function parseLinkHeader(value: string, baseUrl: string): LinkHeaderEntry[] {
  const entries: LinkHeaderEntry[] = []
  let pos = 0
  while (pos < value.length) {
    while (pos < value.length && (WHITESPACE.has(value.charAt(pos)) || value.charAt(pos) === ',')) {
      pos++
    }
    if (pos >= value.length) break
    const start = pos
    if (value.charAt(pos) !== '<') {
      pos = skipEntry(value, pos)
      continue
    }
    const close = value.indexOf('>', pos + 1)
    if (close === -1) break
    const target = value.slice(pos + 1, close).trim()
    pos = close + 1
    const params = new Map<string, string>()
    for (;;) {
      pos = skipWhitespace(value, pos)
      const char = value.charAt(pos)
      if (char === ';') {
        const param = readParam(value, pos + 1)
        pos = param.end
        if (param.name !== '' && !params.has(param.name)) params.set(param.name, param.value)
        continue
      }
      if (char === '' || char === ',') break
      // Anything else is junk inside this entry: skip to the next parameter or entry.
      pos = skipToSeparator(value, pos)
    }
    const rel = params.get('rel')
    entries.push({
      target,
      url: resolve(target, baseUrl),
      rel:
        rel === undefined
          ? []
          : rel
              .toLowerCase()
              .split(/[ \t]+/)
              .filter((token) => token !== ''),
      hreflang: params.get('hreflang') ?? null,
      raw: value.slice(start, pos).trim(),
    })
    if (value.charAt(pos) === ',') pos++
  }
  return entries
}

function readParam(value: string, from: number): { name: string; value: string; end: number } {
  let pos = skipWhitespace(value, from)
  const nameStart = pos
  while (
    pos < value.length &&
    !'=;,'.includes(value.charAt(pos)) &&
    !WHITESPACE.has(value.charAt(pos))
  ) {
    pos++
  }
  const name = value.slice(nameStart, pos).toLowerCase()
  pos = skipWhitespace(value, pos)
  if (value.charAt(pos) !== '=') return { name, value: '', end: pos }
  pos = skipWhitespace(value, pos + 1)
  if (value.charAt(pos) === '"') {
    let text = ''
    pos++
    while (pos < value.length && value.charAt(pos) !== '"') {
      if (value.charAt(pos) === '\\' && pos + 1 < value.length) pos++
      text += value.charAt(pos)
      pos++
    }
    return { name, value: text, end: Math.min(pos + 1, value.length) }
  }
  const valueStart = pos
  while (
    pos < value.length &&
    !';,'.includes(value.charAt(pos)) &&
    !WHITESPACE.has(value.charAt(pos))
  ) {
    pos++
  }
  return { name, value: value.slice(valueStart, pos), end: pos }
}

function skipWhitespace(value: string, pos: number): number {
  while (pos < value.length && WHITESPACE.has(value.charAt(pos))) pos++
  return pos
}

/** Skips to the next ';' or ',' outside a quoted string. */
function skipToSeparator(value: string, pos: number): number {
  let quoted = false
  while (pos < value.length) {
    const char = value.charAt(pos)
    if (quoted && char === '\\') pos++
    else if (char === '"') quoted = !quoted
    else if (!quoted && (char === ';' || char === ',')) return pos
    pos++
  }
  return pos
}

/** Skips a malformed entry up to the next top-level ','. */
function skipEntry(value: string, pos: number): number {
  for (;;) {
    pos = skipToSeparator(value, pos)
    if (pos >= value.length || value.charAt(pos) === ',') return pos
    pos++
  }
}

function resolve(target: string, baseUrl: string): string | null {
  try {
    return new URL(target, baseUrl).href
  } catch {
    return null
  }
}
