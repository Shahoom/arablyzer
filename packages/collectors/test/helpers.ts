/** Encodes text in a single-byte legacy encoding (e.g. windows-1256), for fixtures and tests. */
export function encodeSingleByte(text: string, encoding: string): Uint8Array {
  const decoder = new TextDecoder(encoding)
  const table = new Map<string, number>()
  for (let byte = 0; byte < 256; byte++) {
    const char = decoder.decode(new Uint8Array([byte]))
    if (char !== '�' && !table.has(char)) table.set(char, byte)
  }
  const bytes: number[] = []
  for (const char of text) {
    const byte = table.get(char)
    if (byte === undefined) throw new Error(`${encoding} cannot encode ${JSON.stringify(char)}`)
    bytes.push(byte)
  }
  return new Uint8Array(bytes)
}

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
