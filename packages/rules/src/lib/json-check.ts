export type JsonProblem =
  | 'trailing-comma'
  | 'unexpected-character'
  | 'control-character'
  | 'invalid-escape'
  | 'unexpected-end'

export interface JsonError {
  readonly problem: JsonProblem
  /** Index in the text where the problem is (for a trailing comma: the comma). */
  readonly offset: number
  /** For unexpected-character: the character, or U+XXXX when it is invisible. */
  readonly character?: string
}

type Container = 'object' | 'array'
type State = 'value' | 'key' | 'after'

/**
 * A strict RFC 8259 check that says what is wrong and where. The engine's JSON.parse messages
 * change between Node versions, so reports would not be the same everywhere; this does not.
 * Iterative, so deep nesting in a hostile page cannot exhaust the stack.
 */
export function checkJson(text: string): JsonError | null {
  const stack: Container[] = []
  let pos = skipSpace(text, 0)
  let state: State = 'value'
  let comma = -1

  const unexpected = (at: number): JsonError => unexpectedAt(text, at)

  for (;;) {
    if (state === 'value') {
      const char = text.charAt(pos)
      if (char === '{' || char === '[') {
        stack.push(char === '{' ? 'object' : 'array')
        pos = skipSpace(text, pos + 1)
        if (text.charAt(pos) === (char === '{' ? '}' : ']')) {
          stack.pop()
          pos++
          state = 'after'
        } else state = char === '{' ? 'key' : 'value'
        comma = -1
        continue
      }
      if (char === ']' && comma !== -1) return { problem: 'trailing-comma', offset: comma }
      const end =
        char === '"'
          ? scanString(text, pos)
          : char === '-' || isDigit(char)
            ? scanNumber(text, pos)
            : scanLiteral(text, pos)
      if (typeof end !== 'number') return end ?? unexpected(pos)
      pos = end
      state = 'after'
      continue
    }

    if (state === 'key') {
      const char = text.charAt(pos)
      if (char === '}' && comma !== -1) return { problem: 'trailing-comma', offset: comma }
      if (char !== '"') return unexpected(pos)
      const end = scanString(text, pos)
      if (typeof end !== 'number') return end
      // A key follows the comma, so that comma was not trailing.
      comma = -1
      pos = skipSpace(text, end)
      if (text.charAt(pos) !== ':') return unexpected(pos)
      pos = skipSpace(text, pos + 1)
      state = 'value'
      continue
    }

    // After a complete value.
    pos = skipSpace(text, pos)
    const top = stack.at(-1)
    if (top === undefined) return pos === text.length ? null : unexpected(pos)
    const char = text.charAt(pos)
    if (char === ',') {
      comma = pos
      pos = skipSpace(text, pos + 1)
      state = top === 'object' ? 'key' : 'value'
      continue
    }
    if (char === (top === 'object' ? '}' : ']')) {
      stack.pop()
      pos++
      continue
    }
    return unexpected(pos)
  }
}

/** The end of the string starting at `start` (a quote), or the error inside it. */
function scanString(text: string, start: number): number | JsonError {
  let pos = start + 1
  for (;;) {
    if (pos >= text.length) return { problem: 'unexpected-end', offset: text.length }
    const code = text.charCodeAt(pos)
    if (code === 0x22) return pos + 1
    if (code < 0x20) return { problem: 'control-character', offset: pos }
    if (code === 0x5c) {
      const next = text.charAt(pos + 1)
      if ('"\\/bfnrt'.includes(next) && next !== '') pos += 2
      else if (next === 'u' && /^[0-9A-Fa-f]{4}$/.test(text.slice(pos + 2, pos + 6))) pos += 6
      else return { problem: 'invalid-escape', offset: pos }
      continue
    }
    pos++
  }
}

/** RFC 8259 number: -? (0 | [1-9][0-9]*) (.[0-9]+)? ([eE][+-]?[0-9]+)?, erring where it breaks. */
function scanNumber(text: string, start: number): number | JsonError {
  let pos = start
  if (text.charAt(pos) === '-') pos++
  if (text.charAt(pos) === '0') pos++
  else if (isDigit(text.charAt(pos))) pos = skipDigits(text, pos)
  else return unexpectedAt(text, pos)
  if (text.charAt(pos) === '.') {
    if (!isDigit(text.charAt(pos + 1))) return unexpectedAt(text, pos + 1)
    pos = skipDigits(text, pos + 1)
  }
  if (text.charAt(pos) === 'e' || text.charAt(pos) === 'E') {
    pos++
    if (text.charAt(pos) === '+' || text.charAt(pos) === '-') pos++
    if (!isDigit(text.charAt(pos))) return unexpectedAt(text, pos)
    pos = skipDigits(text, pos)
  }
  return pos
}

function skipDigits(text: string, pos: number): number {
  while (isDigit(text.charAt(pos))) pos++
  return pos
}

function unexpectedAt(text: string, at: number): JsonError {
  return at >= text.length
    ? { problem: 'unexpected-end', offset: text.length }
    : { problem: 'unexpected-character', offset: at, character: visible(text.codePointAt(at) ?? 0) }
}

function scanLiteral(text: string, start: number): number | undefined {
  for (const literal of ['true', 'false', 'null']) {
    if (text.startsWith(literal, start)) return start + literal.length
  }
  return undefined
}

function skipSpace(text: string, pos: number): number {
  while (pos < text.length && ' \t\n\r'.includes(text.charAt(pos))) pos++
  return pos
}

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9'
}

function visible(codePoint: number): string {
  const char = String.fromCodePoint(codePoint)
  return /^[\p{L}\p{N}\p{P}\p{S}]$/u.test(char)
    ? char
    : `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`
}
