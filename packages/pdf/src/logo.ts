import { LOGO_TYPES, MAX_LOGO_BYTES, MAX_LOGO_PIXELS, type LogoType } from '@arablyzer/api-contract'

/** Why a logo was not accepted. */
export type LogoProblem = 'too-large' | 'type' | 'dimensions' | 'corrupt'

export type LogoCheck =
  | {
      readonly ok: true
      readonly type: LogoType
      readonly width: number
      readonly height: number
      /** The image with its metadata removed (EXIF, text, colour-profile and XMP chunks). */
      readonly bytes: Uint8Array
    }
  | { readonly ok: false; readonly problem: LogoProblem }

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const startsWith = (bytes: Uint8Array, signature: readonly number[], at = 0): boolean =>
  signature.every((value, index) => bytes[at + index] === value)
const ascii = (bytes: Uint8Array, at: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(at, at + length))
const u32be = (bytes: Uint8Array, at: number): number =>
  (bytes[at] ?? 0) * 2 ** 24 +
  ((bytes[at + 1] ?? 0) << 16) +
  ((bytes[at + 2] ?? 0) << 8) +
  (bytes[at + 3] ?? 0)
const u24le = (bytes: Uint8Array, at: number): number =>
  (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) | ((bytes[at + 2] ?? 0) << 16)
const u32le = (bytes: Uint8Array, at: number): number =>
  u24le(bytes, at) + (bytes[at + 3] ?? 0) * 2 ** 24

/** What the file is, by its first bytes: never by the name it came with or the type the browser said. */
export function logoTypeOf(bytes: Uint8Array): LogoType | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp'
  return null
}

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** PNG: the chunks that draw the picture, and none of the rest (text, time, profile, EXIF). */
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND', 'acTL', 'fcTL', 'fdAT'])

function cleanPng(bytes: Uint8Array): LogoCheck {
  const kept: Uint8Array[] = [bytes.subarray(0, 8)]
  let at = 8
  let width = 0
  let height = 0
  let first = true
  let ended = false
  while (at + 12 <= bytes.length) {
    const length = u32be(bytes, at)
    const name = ascii(bytes, at + 4, 4)
    const end = at + 12 + length
    if (end > bytes.length) return { ok: false, problem: 'corrupt' }
    if (first) {
      if (name !== 'IHDR' || length !== 13) return { ok: false, problem: 'corrupt' }
      width = u32be(bytes, at + 8)
      height = u32be(bytes, at + 12)
      first = false
    }
    if (PNG_KEEP.has(name)) kept.push(bytes.subarray(at, end))
    at = end
    if (name === 'IEND') {
      ended = true
      break
    }
  }
  if (!ended || width < 1 || height < 1) return { ok: false, problem: 'corrupt' }
  return finish('image/png', width, height, concat(kept))
}

/** JPEG: the segments up to the scan, less the application segments (EXIF, XMP, ICC), then the data. */
function cleanJpeg(bytes: Uint8Array): LogoCheck {
  const kept: Uint8Array[] = [bytes.subarray(0, 2)]
  let at = 2
  let width = 0
  let height = 0
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return { ok: false, problem: 'corrupt' }
    const marker = bytes[at + 1] ?? 0
    if (marker === 0xff) {
      at++
      continue
    }
    if (marker === 0xd9) return { ok: false, problem: 'corrupt' }
    const length = ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0)
    if (length < 2 || at + 2 + length > bytes.length) return { ok: false, problem: 'corrupt' }
    const segment = bytes.subarray(at, at + 2 + length)
    // APP0 (JFIF) and APP14 (Adobe, which says how the colours are stored) are kept; other APPn and comments go.
    const application = marker >= 0xe0 && marker <= 0xef
    if (!(application && marker !== 0xe0 && marker !== 0xee) && marker !== 0xfe) kept.push(segment)
    // A frame header: height, then width.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      height = ((bytes[at + 5] ?? 0) << 8) | (bytes[at + 6] ?? 0)
      width = ((bytes[at + 7] ?? 0) << 8) | (bytes[at + 8] ?? 0)
    }
    at += 2 + length
    if (marker === 0xda) {
      // The entropy-coded data runs to the end of the file; it is kept whole.
      kept.push(bytes.subarray(at))
      break
    }
  }
  if (width < 1 || height < 1) return { ok: false, problem: 'corrupt' }
  return finish('image/jpeg', width, height, concat(kept))
}

/** WebP: the RIFF chunks that draw the picture; EXIF and XMP go, and the header's flags for them are cleared. */
const WEBP_DROP = new Set(['EXIF', 'XMP ', 'ICCP'])

function cleanWebp(bytes: Uint8Array): LogoCheck {
  if (bytes.length < 20) return { ok: false, problem: 'corrupt' }
  const riffLength = u32le(bytes, 4)
  if (riffLength + 8 > bytes.length) return { ok: false, problem: 'corrupt' }
  const kept: Uint8Array[] = []
  let width = 0
  let height = 0
  let at = 12
  const end = riffLength + 8
  while (at + 8 <= end) {
    const name = ascii(bytes, at, 4)
    const length = u32le(bytes, at + 4)
    const padded = length + (length % 2)
    if (at + 8 + padded > end) return { ok: false, problem: 'corrupt' }
    let chunk = bytes.subarray(at, at + 8 + padded)
    if (name === 'VP8X') {
      if (length < 10) return { ok: false, problem: 'corrupt' }
      width = u24le(bytes, at + 12) + 1
      height = u24le(bytes, at + 15) + 1
      chunk = chunk.slice()
      // Flags: ICC profile (0x20), EXIF (0x08) and XMP (0x04) are gone with their chunks.
      chunk[8] = (chunk[8] ?? 0) & ~(0x20 | 0x08 | 0x04)
    } else if (name === 'VP8 ' && width === 0) {
      width = ((bytes[at + 14] ?? 0) | ((bytes[at + 15] ?? 0) << 8)) & 0x3fff
      height = ((bytes[at + 16] ?? 0) | ((bytes[at + 17] ?? 0) << 8)) & 0x3fff
    } else if (name === 'VP8L' && width === 0) {
      const bits = u32le(bytes, at + 9)
      width = (bits & 0x3fff) + 1
      height = ((bits >> 14) & 0x3fff) + 1
    }
    if (!WEBP_DROP.has(name)) kept.push(chunk)
    at += 8 + padded
  }
  if (width < 1 || height < 1) return { ok: false, problem: 'corrupt' }
  const body = concat(kept)
  const header = new Uint8Array(12)
  header.set(bytes.subarray(0, 12))
  new DataView(header.buffer).setUint32(4, body.length + 4, true)
  return finish('image/webp', width, height, concat([header, body]))
}

function finish(type: LogoType, width: number, height: number, bytes: Uint8Array): LogoCheck {
  if (width > MAX_LOGO_PIXELS || height > MAX_LOGO_PIXELS)
    return { ok: false, problem: 'dimensions' }
  if (bytes.length > MAX_LOGO_BYTES) return { ok: false, problem: 'too-large' }
  return { ok: true, type, width, height, bytes }
}

/**
 * A logo upload (M4.7): PNG, JPEG or WebP, found by the file's first bytes (SVG, which can carry
 * script, is not among them, whatever its name or type says), at most 200 KB and 2048 pixels on a
 * side, with its metadata taken out. The file is not decoded: its header is read for the size, and
 * its chunks or segments are walked to drop what is not the picture. What comes back is what is kept.
 */
export function checkLogo(input: Uint8Array): LogoCheck {
  // The size is checked before anything is read, with room for the metadata that is dropped.
  if (input.length > MAX_LOGO_BYTES * 4) return { ok: false, problem: 'too-large' }
  const type = logoTypeOf(input)
  if (type === null || !LOGO_TYPES.includes(type)) return { ok: false, problem: 'type' }
  if (type === 'image/png') return cleanPng(input)
  if (type === 'image/jpeg') return cleanJpeg(input)
  return cleanWebp(input)
}
