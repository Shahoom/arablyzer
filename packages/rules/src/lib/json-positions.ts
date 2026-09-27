/** Deeper than this, JSON-LD is not describing anything a rule reads; scans stop there. */
export const MAX_JSON_DEPTH = 64

/** A JSON Pointer (RFC 6901) one step below `parent`. */
export function jsonPointer(parent: string, step: string | number): string {
  return `${parent}/${String(step).replaceAll('~', '~0').replaceAll('/', '~1')}`
}

interface Frame {
  readonly pointer: string
  readonly array: boolean
  index: number
}

/**
 * Where the values at `pointers` (JSON Pointers: '' for the root, '/offers/0/price' inside) start
 * in a JSON text, so findings can point at a line. Meant for text JSON.parse accepted; at anything
 * else, or deeper than MAX_JSON_DEPTH, it stops and returns what it found. A repeated key gives
 * its last value, as JSON.parse does. Iterative, so nesting cannot exhaust the stack.
 */
export function jsonValueOffsets(text: string, pointers: ReadonlySet<string>): Map<string, number> {
  const found = new Map<string, number>()
  const stack: Frame[] = []
  let pos = skipSpace(text, 0)
  let pointer = ''
  let state: 'value' | 'key' | 'after' = 'value'
  for (;;) {
    if (state === 'value') {
      if (pos >= text.length) return found
      if (pointers.has(pointer)) found.set(pointer, pos)
      const char = text.charAt(pos)
      if (char === '{' || char === '[') {
        const array = char === '['
        pos = skipSpace(text, pos + 1)
        if (text.charAt(pos) === (array ? ']' : '}')) {
          pos++
          state = 'after'
        } else {
          if (stack.length === MAX_JSON_DEPTH) return found
          stack.push({ pointer, array, index: 0 })
          if (array) pointer = jsonPointer(pointer, 0)
          else state = 'key'
        }
      } else {
        pos = char === '"' ? stringEnd(text, pos) : literalEnd(text, pos)
        state = 'after'
      }
    } else if (state === 'key') {
      const frame = stack.at(-1)
      if (frame === undefined || text.charAt(pos) !== '"') return found
      const end = stringEnd(text, pos)
      let key: unknown
      try {
        key = JSON.parse(text.slice(pos, end))
      } catch {
        return found
      }
      pos = skipSpace(text, end)
      if (typeof key !== 'string' || text.charAt(pos) !== ':') return found
      pos = skipSpace(text, pos + 1)
      pointer = jsonPointer(frame.pointer, key)
      state = 'value'
    } else {
      pos = skipSpace(text, pos)
      const frame = stack.at(-1)
      if (frame === undefined) return found
      const char = text.charAt(pos)
      if (char === ',') {
        pos = skipSpace(text, pos + 1)
        if (frame.array) {
          frame.index++
          pointer = jsonPointer(frame.pointer, frame.index)
          state = 'value'
        } else {
          state = 'key'
        }
      } else if (char === (frame.array ? ']' : '}')) {
        stack.pop()
        pos++
      } else {
        return found
      }
    }
  }
}

/** The index after the string that starts at `start`. */
function stringEnd(text: string, start: number): number {
  let pos = start + 1
  while (pos < text.length) {
    const char = text.charAt(pos)
    if (char === '"') return pos + 1
    pos += char === '\\' ? 2 : 1
  }
  return text.length
}

/** The index after the number, true, false or null that starts at `start`. */
function literalEnd(text: string, start: number): number {
  let pos = start
  while (pos < text.length && !',]} \t\n\r'.includes(text.charAt(pos))) pos++
  return pos
}

function skipSpace(text: string, start: number): number {
  let pos = start
  while (pos < text.length && ' \t\n\r'.includes(text.charAt(pos))) pos++
  return pos
}
