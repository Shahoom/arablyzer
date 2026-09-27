import { readFileSync } from 'node:fs'
import { brotliCompressSync, deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { inRanges, type CodePointRange } from '../src/code-points'
import { fontCoverage, MAX_FONT_DATA } from '../src/font-coverage'
import { concat } from './helpers'

const font = (name: string): Uint8Array =>
  readFileSync(new URL(`../../../fixtures/shared/fonts/${name}`, import.meta.url))

const count = (ranges: readonly CodePointRange[], from = 0, to = 0x10ffff): number =>
  ranges.reduce(
    (total, [first, last]) => total + Math.max(0, Math.min(last, to) - Math.max(first, from) + 1),
    0,
  )

/** Big-endian fields of the given byte widths. */
function bytes(...fields: readonly (readonly [width: 1 | 2 | 4, value: number])[]): Uint8Array {
  const out = new Uint8Array(fields.reduce((size, [width]) => size + width, 0))
  const view = new DataView(out.buffer)
  let at = 0
  for (const [width, value] of fields) {
    if (width === 1) view.setUint8(at, value)
    else if (width === 2) view.setUint16(at, value)
    else view.setUint32(at, value)
    at += width
  }
  return out
}

const ascii = (text: string): Uint8Array => new TextEncoder().encode(text)

/** A cmap table with one (3,1) format 4 subtable; each segment maps by idDelta. */
function format4Cmap(segments: readonly (readonly [start: number, end: number, delta: number])[]) {
  const all = [...segments, [0xffff, 0xffff, 1] as const]
  const segCount = all.length
  const u16s = (values: readonly number[]) => bytes(...values.map((value) => [2, value] as const))
  const subtable = concat(
    bytes([2, 4], [2, 16 + segCount * 8], [2, 0], [2, segCount * 2], [2, 0], [2, 0], [2, 0]),
    u16s(all.map(([, end]) => end)),
    bytes([2, 0]),
    u16s(all.map(([start]) => start)),
    u16s(all.map(([, , delta]) => delta & 0xffff)),
    u16s(all.map(() => 0)),
  )
  return concat(bytes([2, 0], [2, 1], [2, 3], [2, 1], [4, 12]), subtable)
}

/** A segment mapped through glyphIdArray (idRangeOffset), whose glyphs then get idDelta added. */
interface ArraySegment {
  readonly start: number
  readonly end: number
  readonly delta: number
  readonly glyphs: readonly number[]
}

/** A cmap table with one (3,1) format 4 subtable whose segments look glyphs up in glyphIdArray. */
function format4ArrayCmap(segments: readonly ArraySegment[]) {
  const all = [...segments, { start: 0xffff, end: 0xffff, delta: 1, glyphs: [] }]
  const segCount = all.length
  const u16s = (values: readonly number[]) => bytes(...values.map((value) => [2, value] as const))
  let glyphIndex = 0
  const rangeOffsets = all.map((segment, index) => {
    if (segment.glyphs.length === 0) return 0
    const offset = 2 * (segCount - index) + 2 * glyphIndex
    glyphIndex += segment.glyphs.length
    return offset
  })
  const subtable = concat(
    bytes([2, 4], [2, 0], [2, 0], [2, segCount * 2], [2, 0], [2, 0], [2, 0]),
    u16s(all.map(({ end }) => end)),
    bytes([2, 0]),
    u16s(all.map(({ start }) => start)),
    u16s(all.map(({ delta }) => delta & 0xffff)),
    u16s(rangeOffsets),
    u16s(all.flatMap(({ glyphs }) => glyphs)),
  )
  return concat(bytes([2, 0], [2, 1], [2, 3], [2, 1], [4, 12]), subtable)
}

/** A cmap table with one (3,10) format 12 subtable. */
function format12Cmap(groups: readonly (readonly [first: number, last: number, glyph: number])[]) {
  const header = bytes([2, 12], [2, 0], [4, 16 + groups.length * 12], [4, 0], [4, groups.length])
  const list = new Uint8Array(groups.length * 12)
  const view = new DataView(list.buffer)
  for (const [index, [first, last, glyph]] of groups.entries()) {
    view.setUint32(index * 12, first)
    view.setUint32(index * 12 + 4, last)
    view.setUint32(index * 12 + 8, glyph)
  }
  return concat(bytes([2, 0], [2, 1], [2, 3], [2, 10], [4, 12]), header, list)
}

/** A bare TrueType font holding only the given cmap table. */
function sfnt(cmap: Uint8Array): Uint8Array {
  return concat(
    bytes([4, 0x00010000], [2, 1], [2, 16], [2, 0], [2, 0]),
    ascii('cmap'),
    bytes([4, 0], [4, 28], [4, cmap.length]),
    cmap,
  )
}

/** A WOFF file holding one cmap entry, compressed or not, with the lengths it claims. */
function woff(stored: Uint8Array, claimedLength: number): Uint8Array {
  return concat(
    ascii('wOFF'),
    bytes([4, 0x00010000], [4, 0], [2, 1], [2, 0], [4, 0]),
    new Uint8Array(24),
    ascii('cmap'),
    bytes([4, 64], [4, stored.length], [4, claimedLength], [4, 0]),
    stored,
  )
}

/** A WOFF2 file whose one entry is a cmap of the claimed length, over the given stream. */
function woff2(claimedLength: Uint8Array, stream: Uint8Array): Uint8Array {
  return concat(
    ascii('wOF2'),
    bytes([4, 0x00010000], [4, 0], [2, 1], [2, 0], [4, 0], [4, stream.length]),
    new Uint8Array(24),
    bytes([1, 0]),
    claimedLength,
    stream,
  )
}

/** UIntBase128 (WOFF2 §4.1). */
function base128(value: number): Uint8Array {
  const out: number[] = [value & 0x7f]
  for (let rest = Math.floor(value / 128); rest > 0; rest = Math.floor(rest / 128)) {
    out.unshift((rest & 0x7f) | 0x80)
  }
  return new Uint8Array(out)
}

describe('fontCoverage', () => {
  it('reads the same code points as fontTools from TTF, WOFF and WOFF2', () => {
    const ttf = fontCoverage(font('arablyzer-test-arabic.ttf'))
    expect(ttf).not.toBeNull()
    if (ttf === null) return
    // fontTools 4 getBestCmap: 510 code points in 30 runs, 165 of them in U+0600–06FF.
    expect(ttf).toHaveLength(30)
    expect(count(ttf)).toBe(510)
    expect(count(ttf, 0x600, 0x6ff)).toBe(165)
    expect(ttf[0]).toEqual([0x20, 0x7e])
    for (const codePoint of [0x627, 0x629, 0x67e, 0x6a4, 0x660, 0x6cc, 0x640]) {
      expect(inRanges(ttf, codePoint)).toBe(true)
    }
    expect(fontCoverage(font('arablyzer-test-arabic.woff'))).toEqual(ttf)
    expect(fontCoverage(font('arablyzer-test-arabic.woff2'))).toEqual(ttf)
  })

  it('shows which letters a subset font lacks', () => {
    const partial = fontCoverage(font('arablyzer-test-arabic-partial.woff2'))
    expect(partial).not.toBeNull()
    if (partial === null) return
    expect(count(partial)).toBe(248)
    expect(count(partial, 0x600, 0x6ff)).toBe(153)
    expect(inRanges(partial, 0x627)).toBe(true)
    for (const codePoint of [0x67e, 0x6a4, 0x660, 0x669]) {
      expect(inRanges(partial, codePoint)).toBe(false)
    }
  })

  it('reads glyphs looked up through idRangeOffset as fontTools does', () => {
    // 73 characters mapped to glyphs in shuffled order: 3 of its 6 segments use glyphIdArray.
    expect(fontCoverage(font('arablyzer-test-range-offset.ttf'))).toEqual([
      [0x41, 0x5a],
      [0x621, 0x64a],
      [0x660, 0x662],
      [0x6a4, 0x6a4],
      [0x6cc, 0x6cc],
    ])
    expect(
      fontCoverage(
        sfnt(
          format4ArrayCmap([
            // Glyph 0 in the array is .notdef: U+0628 is not covered.
            { start: 0x627, end: 0x62a, delta: 0, glyphs: [5, 0, 7, 9] },
            // idDelta is added to what the array gives, and may bring it to 0.
            { start: 0x641, end: 0x643, delta: 10, glyphs: [1, 0xfff6, 2] },
            // An array shorter than its segment: code points past the table map to nothing.
            { start: 0x660, end: 0x669, delta: 0, glyphs: [3, 4] },
          ]),
        ),
      ),
    ).toEqual([
      [0x627, 0x627],
      [0x629, 0x62a],
      [0x641, 0x641],
      [0x643, 0x643],
      [0x660, 0x661],
    ])
  })

  it('finds no Arabic in a Latin font', () => {
    const latin = fontCoverage(font('arablyzer-test-latin.ttf'))
    expect(latin).toEqual([
      [0x20, 0x7e],
      [0xa0, 0xa0],
    ])
  })

  it('reads format 4 and format 12 subtables, leaving out what maps to .notdef', () => {
    expect(
      fontCoverage(
        sfnt(
          format4Cmap([
            [0x41, 0x43, 1],
            [0x627, 0x62a, 0x10000 - 0x627],
          ]),
        ),
      ),
    ).toEqual([
      [0x41, 0x43],
      [0x628, 0x62a],
    ])
    expect(
      fontCoverage(
        sfnt(
          format12Cmap([
            [0x600, 0x6ff, 1],
            [0x1ee00, 0x1eeff, 0],
          ]),
        ),
      ),
    ).toEqual([
      [0x600, 0x6ff],
      [0x1ee01, 0x1eeff],
    ])
  })

  it('reads a WOFF table stored with zlib', () => {
    const cmap = format12Cmap([[0x600, 0x6ff, 1]])
    expect(fontCoverage(woff(deflateSync(cmap), cmap.length))).toEqual([[0x600, 0x6ff]])
  })

  it('gives null for files it cannot read', () => {
    const full = font('arablyzer-test-arabic.woff2')
    expect(fontCoverage(full.subarray(0, Math.floor(full.length / 2)))).toBeNull()
    expect(fontCoverage(font('arablyzer-test-arabic.ttf').subarray(0, 200))).toBeNull()
    expect(fontCoverage(new Uint8Array(0))).toBeNull()
    expect(fontCoverage(ascii('<!doctype html><title>404</title>'))).toBeNull()
    expect(fontCoverage(concat(ascii('ttcf'), new Uint8Array(40)))).toBeNull()
    // A cmap with no Unicode subtable in format 4 or 12.
    expect(fontCoverage(sfnt(bytes([2, 0], [2, 1], [2, 1], [2, 0], [4, 12], [2, 0])))).toBeNull()
  })

  it('reads nothing past its limits', () => {
    // A WOFF table claiming more than MAX_FONT_DATA, and one that inflates past what it claims.
    const small = format12Cmap([[0x600, 0x6ff, 1]])
    expect(fontCoverage(woff(deflateSync(small), MAX_FONT_DATA + 1))).toBeNull()
    const bomb = deflateSync(new Uint8Array(8 * 1024 * 1024))
    expect(fontCoverage(woff(bomb, 1024))).toBeNull()
    // A WOFF2 directory claiming more than MAX_FONT_DATA is refused before any Brotli.
    expect(fontCoverage(woff2(base128(MAX_FONT_DATA + 1), new Uint8Array(16)))).toBeNull()
    // A Brotli stream that inflates past the tables' total stops at it.
    const stream = brotliCompressSync(new Uint8Array(16 * 1024 * 1024))
    expect(fontCoverage(woff2(base128(1024), stream))).toBeNull()
    // UIntBase128 with a leading zero byte, or past 32 bits.
    expect(fontCoverage(woff2(new Uint8Array([0x80, 0x01]), new Uint8Array(16)))).toBeNull()
    expect(fontCoverage(woff2(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x7f]), stream))).toBeNull()
  })

  it('refuses format 4 segments out of order or overlapping, as browsers refuse the font', () => {
    const outOfOrder = format4Cmap([
      [0x700, 0x7ff, 1],
      [0x600, 0x6ff, 1],
    ])
    expect(fontCoverage(sfnt(outOfOrder))).toBeNull()
    const overlapping = format4Cmap(Array.from({ length: 8000 }, () => [0, 0xfffe, 1] as const))
    const started = performance.now()
    expect(fontCoverage(sfnt(overlapping))).toBeNull()
    expect(performance.now() - started).toBeLessThan(2_000)
  })

  it('stays fast on a full format 4 table and many format 12 groups', () => {
    const full = format4Cmap(
      Array.from({ length: 8000 }, (_, index) => [index * 8, index * 8 + 7, 1] as const),
    )
    let started = performance.now()
    expect(fontCoverage(sfnt(full))).toEqual([[0, 63_999]])
    expect(performance.now() - started).toBeLessThan(2_000)

    const groups = Array.from(
      { length: 150_000 },
      (_, index) => [index * 4, index * 4 + 1, 1] as const,
    )
    started = performance.now()
    expect(fontCoverage(sfnt(format12Cmap(groups)))).toHaveLength(150_000)
    expect(performance.now() - started).toBeLessThan(5_000)
    // More groups than any real font has.
    const tooMany = format12Cmap([[0x600, 0x6ff, 1]])
    new DataView(tooMany.buffer, tooMany.byteOffset).setUint32(12 + 12, 300_000)
    expect(fontCoverage(sfnt(tooMany))).toBeNull()
  }, 30_000)
})
