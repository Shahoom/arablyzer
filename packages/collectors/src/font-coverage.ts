import { brotliDecompressSync, inflateSync } from 'node:zlib'
import { MAX_CODE_POINT, mergeRanges, type CodePointRange } from './code-points'

/**
 * The most table data read from one font file once decompressed: its WOFF cmap table, or all of
 * a WOFF2 file's tables, which Brotli compresses as one stream. Fonts of 5 MB, the most a render
 * keeps, stay well under it.
 */
export const MAX_FONT_DATA = 32 * 1024 * 1024
/** cmap format 12 groups; real fonts have a few thousand. */
const MAX_GROUPS = 200_000

/** WOFF2's known table tags, by their index in a table directory entry's flags (WOFF2 §5.1). */
// prettier-ignore
const WOFF2_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca',
  'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea',
  'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL',
  'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
] as const

/** TrueType, OpenType with CFF outlines, and Apple's TrueType. */
const SFNT_VERSIONS = new Set(['\u0000\u0001\u0000\u0000', 'OTTO', 'true'])

/**
 * Unicode subtables in fontTools' order of preference (getBestCmap), as platform and encoding.
 * The first of them in a format read here (4 or 12) is the one read.
 */
const PREFERRED: readonly (readonly [number, number])[] = [
  [3, 10],
  [0, 6],
  [0, 4],
  [3, 1],
  [0, 3],
  [0, 2],
  [0, 1],
  [0, 0],
]

class Malformed extends Error {}

/** Big-endian reads that throw Malformed rather than read past the data. */
class Bytes {
  readonly data: Uint8Array
  private readonly view: DataView

  constructor(data: Uint8Array) {
    this.data = data
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  }

  get length(): number {
    return this.data.byteLength
  }

  u8(offset: number): number {
    this.check(offset, 1)
    return this.view.getUint8(offset)
  }

  u16(offset: number): number {
    this.check(offset, 2)
    return this.view.getUint16(offset)
  }

  u32(offset: number): number {
    this.check(offset, 4)
    return this.view.getUint32(offset)
  }

  tag(offset: number): string {
    this.check(offset, 4)
    return String.fromCharCode(...this.data.subarray(offset, offset + 4))
  }

  slice(offset: number, length: number): Uint8Array {
    this.check(offset, length)
    return this.data.subarray(offset, offset + length)
  }

  private check(offset: number, length: number): void {
    if (offset < 0 || length < 0 || offset + length > this.data.byteLength) throw new Malformed()
  }
}

/**
 * The code points a font file maps to a glyph, from its cmap table, as sorted ranges: TrueType or
 * OpenType, bare or in WOFF or WOFF2. Null when the file is none of these, is a collection, has
 * no Unicode cmap in format 4 or 12, is malformed, or holds more than MAX_FONT_DATA once
 * decompressed. Glyph 0 is .notdef, which draws nothing: the browser draws such a character in
 * another font, so it is not covered.
 */
export function fontCoverage(file: Uint8Array): CodePointRange[] | null {
  try {
    const cmap = cmapTable(new Bytes(file))
    return cmap === null ? null : unicodeCoverage(new Bytes(cmap))
  } catch {
    // Malformed data, a zlib or Brotli error, or output past its limit.
    return null
  }
}

function cmapTable(file: Bytes): Uint8Array | null {
  const signature = file.tag(0)
  if (signature === 'wOFF') return woffCmap(file)
  if (signature === 'wOF2') return woff2Cmap(file)
  if (SFNT_VERSIONS.has(signature)) return sfntCmap(file)
  return null
}

/** OpenType §5: table records of 16 bytes after a 12-byte header. */
function sfntCmap(file: Bytes): Uint8Array | null {
  const count = file.u16(4)
  for (let index = 0; index < count; index++) {
    const record = 12 + index * 16
    if (file.tag(record) === 'cmap') return file.slice(file.u32(record + 8), file.u32(record + 12))
  }
  return null
}

/** WOFF 1.0 §4–5: 20-byte table entries after a 44-byte header, each table zlib-compressed or not. */
function woffCmap(file: Bytes): Uint8Array | null {
  const count = file.u16(12)
  for (let index = 0; index < count; index++) {
    const entry = 44 + index * 20
    if (file.tag(entry) !== 'cmap') continue
    const stored = file.u32(entry + 8)
    const length = file.u32(entry + 12)
    const data = file.slice(file.u32(entry + 4), stored)
    if (stored === length) return data
    if (stored > length || length > MAX_FONT_DATA) throw new Malformed()
    const table = inflateSync(data, { maxOutputLength: length })
    if (table.byteLength !== length) throw new Malformed()
    return table
  }
  return null
}

/**
 * WOFF2 §4–5: a 48-byte header, then variable-length table entries, then every table in one
 * Brotli stream, in the entries' order. Only the stream up to the end of the tables is inflated.
 */
function woff2Cmap(file: Bytes): Uint8Array | null {
  // A collection's directory follows the tables' entries and changes where the stream starts.
  if (file.tag(4) === 'ttcf') return null
  const count = file.u16(12)
  const compressed = file.u32(20)
  let at = 48
  /** UIntBase128 (WOFF2 §4.1): at most five bytes, no leading zeros, fits in 32 bits. */
  const base128 = (): number => {
    let value = 0
    for (let index = 0; index < 5; index++) {
      const byte = file.u8(at++)
      if (index === 0 && byte === 0x80) throw new Malformed()
      if (value >= 0x2000000) throw new Malformed()
      value = value * 128 + (byte & 0x7f)
      if ((byte & 0x80) === 0) return value
    }
    throw new Malformed()
  }
  let size = 0
  let cmap: { readonly offset: number; readonly length: number } | null = null
  for (let index = 0; index < count; index++) {
    const flags = file.u8(at++)
    const known = flags & 0x3f
    let tag: string
    if (known === 63) {
      tag = file.tag(at)
      at += 4
    } else {
      tag = WOFF2_TAGS[known] ?? ''
    }
    const version = flags >> 6
    const length = base128()
    // glyf and loca are transformed unless version 3; any other table is, unless version 0.
    const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0
    const stored = transformed ? base128() : length
    if (tag === 'cmap') {
      // No transform of cmap is defined.
      if (transformed) throw new Malformed()
      cmap = { offset: size, length: stored }
    }
    size += stored
    if (size > MAX_FONT_DATA) throw new Malformed()
  }
  if (cmap === null) return null
  const stream = brotliDecompressSync(file.slice(at, compressed), { maxOutputLength: size })
  return new Bytes(stream).slice(cmap.offset, cmap.length)
}

/** The preferred Unicode subtable's code points. */
function unicodeCoverage(cmap: Bytes): CodePointRange[] | null {
  const count = cmap.u16(2)
  const subtables: { platform: number; encoding: number; offset: number; format: number }[] = []
  for (let index = 0; index < count; index++) {
    const record = 4 + index * 8
    const offset = cmap.u32(record + 4)
    subtables.push({
      platform: cmap.u16(record),
      encoding: cmap.u16(record + 2),
      offset,
      format: cmap.u16(offset),
    })
  }
  for (const [platform, encoding] of PREFERRED) {
    const subtable = subtables.find(
      (item) =>
        item.platform === platform &&
        item.encoding === encoding &&
        (item.format === 4 || item.format === 12),
    )
    if (subtable === undefined) continue
    const data = new Bytes(cmap.data.subarray(subtable.offset))
    return subtable.format === 4 ? format4(data) : format12(data)
  }
  return null
}

/**
 * Segments of 16-bit code points (OpenType cmap format 4). Code points already seen are skipped,
 * so overlapping segments cost no more than 65,536 steps in all.
 */
function format4(table: Bytes): CodePointRange[] {
  const segments = table.u16(6) >>> 1
  const ends = 14
  const starts = ends + segments * 2 + 2
  const deltas = starts + segments * 2
  const offsets = deltas + segments * 2
  const ranges: [number, number][] = []
  let next = 0
  for (let segment = 0; segment < segments; segment++) {
    const end = table.u16(ends + segment * 2)
    const start = table.u16(starts + segment * 2)
    const delta = table.u16(deltas + segment * 2)
    const rangeOffset = table.u16(offsets + segment * 2)
    for (
      let codePoint = Math.max(start, next);
      codePoint <= end && codePoint < 0xffff;
      codePoint++
    ) {
      let glyph: number
      if (rangeOffset === 0) {
        glyph = (codePoint + delta) & 0xffff
      } else {
        // An index past the table maps to no glyph, as in HarfBuzz.
        const at = offsets + segment * 2 + rangeOffset + (codePoint - start) * 2
        glyph = at + 2 > table.length ? 0 : table.u16(at)
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff
      }
      if (glyph === 0) continue
      const last = ranges.at(-1)
      if (last?.[1] === codePoint - 1) last[1] = codePoint
      else ranges.push([codePoint, codePoint])
    }
    next = Math.max(next, end + 1)
  }
  return ranges
}

/** Groups of code points mapped to consecutive glyphs (OpenType cmap format 12). */
function format12(table: Bytes): CodePointRange[] {
  const groups = table.u32(12)
  if (groups > MAX_GROUPS || 16 + groups * 12 > table.length) throw new Malformed()
  const ranges: CodePointRange[] = []
  for (let group = 0; group < groups; group++) {
    const at = 16 + group * 12
    const first = table.u32(at)
    const last = Math.min(table.u32(at + 4), MAX_CODE_POINT)
    // A group that starts at glyph 0 maps its first code point to .notdef.
    ranges.push([table.u32(at + 8) === 0 ? first + 1 : first, last])
  }
  return mergeRanges(ranges)
}
