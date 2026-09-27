export type EncodingSource = 'bom' | 'http' | 'meta' | 'sniffed' | 'default'

export interface EncodingInfo {
  /** WHATWG encoding name, e.g. "utf-8" or "windows-1256". */
  readonly name: string
  readonly source: EncodingSource
}

/** HTML §13.2.3.2: the meta prescan looks at no more than this many bytes. */
const PRESCAN_BYTES = 1024

/**
 * Picks the encoding a browser would use for an HTML response: BOM, then the Content-Type charset,
 * then a <meta> prescan. Without a declaration it tells UTF-8 from legacy text; legacy text written
 * in runs of non-ASCII bytes is taken as windows-1256, the encoding of older Arabic pages.
 */
export function sniffEncoding(bytes: Uint8Array, contentType: string | null): EncodingInfo {
  const bom = bomEncoding(bytes)
  if (bom !== null) return { name: bom, source: 'bom' }
  const declared = contentType === null ? null : charsetParam(contentType)
  const fromHttp = declared === null ? null : getEncoding(declared)
  if (fromHttp !== null) return { name: fromHttp, source: 'http' }
  const fromMeta = prescan(bytes.subarray(0, PRESCAN_BYTES))
  if (fromMeta !== null) return { name: fromMeta, source: 'meta' }
  return guess(bytes)
}

export function decodeHtml(
  bytes: Uint8Array,
  contentType: string | null,
): { text: string; encoding: EncodingInfo } {
  const encoding = sniffEncoding(bytes, contentType)
  // TextDecoder strips a BOM that matches the encoding (ignoreBOM defaults to false).
  const text =
    encoding.name === 'windows-1252'
      ? decodeWindows1252(bytes)
      : new TextDecoder(encoding.name).decode(bytes)
  return { text, encoding }
}

/**
 * WHATWG index-windows-1252 for 0x80–0x9F; every other byte is its own code point. Node's
 * TextDecoder reads these bytes as ISO-8859-1 control characters (checked on Node 22.22), where
 * browsers show € … “ ” and the rest, so this decoder does not rely on it.
 */
const WINDOWS_1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152,
  0x8d, 0x17d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122,
  0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
]

/** windows-1252 as WHATWG and browsers decode it (the labels iso-8859-1 and us-ascii included). */
export function decodeWindows1252(bytes: Uint8Array): string {
  // Latin-1 gives every byte its own code point; then only 0x80–0x9F change.
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .toString('latin1')
    .replace(/[\u0080-\u009f]/g, (char) =>
      String.fromCharCode(WINDOWS_1252_HIGH[char.charCodeAt(0) - 0x80] ?? char.charCodeAt(0)),
    )
}

function bomEncoding(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8'
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be'
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le'
  return null
}

/** WHATWG "get an encoding": label → canonical name, or null for unknown labels. */
function getEncoding(label: string): string | null {
  // HTML maps x-user-defined to windows-1252 in the prescan; Node has no decoder for it anyway.
  if (label.trim().toLowerCase() === 'x-user-defined') return 'windows-1252'
  try {
    return new TextDecoder(label.trim()).encoding
  } catch {
    return null
  }
}

/** The charset parameter of a Content-Type value, quoted or not. */
function charsetParam(contentType: string): string | null {
  for (const part of contentType.split(';').slice(1)) {
    const eq = part.indexOf('=')
    if (eq === -1 || part.slice(0, eq).trim().toLowerCase() !== 'charset') continue
    const value = part.slice(eq + 1).trim()
    if (!value.startsWith('"')) return value
    const end = value.indexOf('"', 1)
    return end === -1 ? value.slice(1) : value.slice(1, end)
  }
  return null
}

const SPACE = new Set([0x09, 0x0a, 0x0c, 0x0d, 0x20])
const isAsciiLetter = (byte: number | undefined) =>
  byte !== undefined && ((byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a))

/** HTML "prescan a byte stream to determine its encoding". */
function prescan(bytes: Uint8Array): string | null {
  let pos = 0
  while (pos < bytes.length) {
    if (startsWith(bytes, pos, '<!--')) {
      const end = indexOf(bytes, '-->', pos + 2)
      if (end === -1) return null
      pos = end + 3
      continue
    }
    if (startsWithIgnoreCase(bytes, pos, '<meta') && isSpaceOrSlash(bytes[pos + 5])) {
      const result = prescanMeta(bytes, pos + 5)
      if (result.encoding !== null) return result.encoding
      pos = result.end
      continue
    }
    if (
      (bytes[pos] === 0x3c && isAsciiLetter(bytes[pos + 1])) ||
      (startsWith(bytes, pos, '</') && isAsciiLetter(bytes[pos + 2]))
    ) {
      pos++
      while (pos < bytes.length && !SPACE.has(bytes[pos] ?? 0) && bytes[pos] !== 0x3e) pos++
      for (;;) {
        const attribute = readAttribute(bytes, pos)
        pos = attribute.end
        if (attribute.name === null) break
      }
      continue
    }
    if (
      startsWith(bytes, pos, '<!') ||
      startsWith(bytes, pos, '</') ||
      startsWith(bytes, pos, '<?')
    ) {
      const end = bytes.indexOf(0x3e, pos)
      if (end === -1) return null
      pos = end + 1
      continue
    }
    pos++
  }
  return null
}

function prescanMeta(bytes: Uint8Array, from: number): { encoding: string | null; end: number } {
  const seen = new Set<string>()
  let gotPragma = false
  let needPragma: boolean | null = null
  let charset: string | null = null
  let pos = from
  for (;;) {
    const { name, value, end } = readAttribute(bytes, pos)
    pos = end
    if (name === null) break
    if (seen.has(name)) continue
    seen.add(name)
    if (name === 'http-equiv' && value === 'content-type') gotPragma = true
    else if (name === 'content' && charset === null) {
      const found = charsetFromContent(value)
      if (found !== null) {
        charset = found
        needPragma = true
      }
    } else if (name === 'charset') {
      charset = getEncoding(value)
      needPragma = false
    }
  }
  if (needPragma === null || (needPragma && !gotPragma) || charset === null) {
    return { encoding: null, end: pos }
  }
  if (charset === 'utf-16be' || charset === 'utf-16le') return { encoding: 'utf-8', end: pos }
  return { encoding: charset, end: pos }
}

/** HTML "get an attribute" for the prescan; names and values are ASCII-lowercased. */
function readAttribute(
  bytes: Uint8Array,
  from: number,
): { name: string | null; value: string; end: number } {
  let pos = from
  while (pos < bytes.length && (SPACE.has(bytes[pos] ?? 0) || bytes[pos] === 0x2f)) pos++
  if (pos >= bytes.length || bytes[pos] === 0x3e) return { name: null, value: '', end: pos + 1 }
  let name = ''
  while (pos < bytes.length) {
    const byte = bytes[pos] ?? 0
    if (byte === 0x3d && name !== '') break
    if (SPACE.has(byte) || byte === 0x2f || byte === 0x3e) break
    name += lower(byte)
    pos++
  }
  while (pos < bytes.length && SPACE.has(bytes[pos] ?? 0)) pos++
  if (bytes[pos] !== 0x3d) return { name, value: '', end: pos }
  pos++
  while (pos < bytes.length && SPACE.has(bytes[pos] ?? 0)) pos++
  let value = ''
  const quote = bytes[pos]
  if (quote === 0x22 || quote === 0x27) {
    pos++
    while (pos < bytes.length && bytes[pos] !== quote) {
      value += lower(bytes[pos] ?? 0)
      pos++
    }
    return { name, value, end: pos + 1 }
  }
  while (pos < bytes.length && !SPACE.has(bytes[pos] ?? 0) && bytes[pos] !== 0x3e) {
    value += lower(bytes[pos] ?? 0)
    pos++
  }
  return { name, value, end: pos }
}

/** HTML "extract a character encoding from a meta element" (the content attribute). */
function charsetFromContent(content: string): string | null {
  let pos = 0
  for (;;) {
    const found = content.indexOf('charset', pos)
    if (found === -1) return null
    pos = found + 7
    while (pos < content.length && SPACE.has(content.charCodeAt(pos))) pos++
    if (content.charAt(pos) !== '=') continue
    pos++
    while (pos < content.length && SPACE.has(content.charCodeAt(pos))) pos++
    const quote = content.charAt(pos)
    if (quote === '"' || quote === "'") {
      const end = content.indexOf(quote, pos + 1)
      return end === -1 ? null : getEncoding(content.slice(pos + 1, end))
    }
    let end = pos
    while (
      end < content.length &&
      !SPACE.has(content.charCodeAt(end)) &&
      content.charAt(end) !== ';'
    ) {
      end++
    }
    return end === pos ? null : getEncoding(content.slice(pos, end))
  }
}

/**
 * No declaration: valid UTF-8 with non-ASCII bytes is UTF-8. Otherwise, Arabic words in
 * windows-1256 are runs of bytes ≥ 0x80, while Western European text has mostly single accented
 * letters between ASCII ones.
 */
function guess(bytes: Uint8Array): EncodingInfo {
  let high = 0
  let inRuns = 0
  for (let i = 0; i < bytes.length; i++) {
    if ((bytes[i] ?? 0) < 0x80) continue
    high++
    if ((bytes[i - 1] ?? 0) >= 0x80 || (bytes[i + 1] ?? 0) >= 0x80) inRuns++
  }
  if (high === 0) return { name: 'utf-8', source: 'default' }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { name: 'utf-8', source: 'sniffed' }
  } catch {
    return { name: inRuns * 2 > high ? 'windows-1256' : 'windows-1252', source: 'sniffed' }
  }
}

function isSpaceOrSlash(byte: number | undefined): boolean {
  return byte !== undefined && (SPACE.has(byte) || byte === 0x2f)
}

function lower(byte: number): string {
  return String.fromCharCode(byte >= 0x41 && byte <= 0x5a ? byte + 0x20 : byte)
}

function startsWith(bytes: Uint8Array, pos: number, text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (bytes[pos + i] !== text.charCodeAt(i)) return false
  }
  return true
}

function startsWithIgnoreCase(bytes: Uint8Array, pos: number, text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const byte = bytes[pos + i]
    if (byte === undefined || lower(byte) !== text.charAt(i)) return false
  }
  return true
}

function indexOf(bytes: Uint8Array, text: string, from: number): number {
  for (let pos = from; pos + text.length <= bytes.length; pos++) {
    if (startsWith(bytes, pos, text)) return pos
  }
  return -1
}
