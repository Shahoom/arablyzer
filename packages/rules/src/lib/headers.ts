import { headerValues, type Header } from '@arablyzer/collectors'

/**
 * A header's values as browsers read a list of them (Fetch "get, decode, and split"): every
 * header of that name joined with ", ", split at the commas outside double quotes, each value
 * without the spaces and tabs around it. Null when the response has no such header; an empty
 * header gives one empty value.
 */
export function getDecodeSplit(headers: readonly Header[], name: string): string[] | null {
  const values = headerValues(headers, name)
  return values.length === 0 ? null : splitValues(values.join(', '))
}

/** A–Z to a–z and nothing else, as header values are compared "ASCII case-insensitively". */
export function asciiLowercase(text: string): string {
  return text.replace(/[A-Z]/g, (letter) => letter.toLowerCase())
}

/** HTTP tab or space, around each value. */
const EDGE_SPACE = /^[\t ]+|[\t ]+$/g

function splitValues(input: string): string[] {
  const values: string[] = []
  let position = 0
  let value = ''
  for (;;) {
    const start = position
    while (position < input.length && input[position] !== '"' && input[position] !== ',') {
      position++
    }
    value += input.slice(start, position)
    if (input[position] === '"') {
      const end = quotedStringEnd(input, position)
      value += input.slice(position, end)
      position = end
      if (position < input.length) continue
    }
    values.push(value.replace(EDGE_SPACE, ''))
    value = ''
    if (position >= input.length) return values
    // A comma: the next value starts after it.
    position++
  }
}

/** Where an HTTP quoted string that opens at `start` ends: past its closing quote, or at the end. */
function quotedStringEnd(input: string, start: number): number {
  let position = start + 1
  while (position < input.length) {
    const character = input[position]
    position++
    if (character === '"') return position
    // A backslash quotes the character after it.
    if (character === '\\') position++
  }
  return Math.min(position, input.length)
}
