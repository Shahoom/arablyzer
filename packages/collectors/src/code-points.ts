/** A run of code points, first and last included. */
export type CodePointRange = readonly [first: number, last: number]

export const MAX_CODE_POINT = 0x10ffff

/** The whole of Unicode: a face's range when its @font-face rule sets no unicode-range. */
export const ALL_CODE_POINTS: readonly CodePointRange[] = [[0, MAX_CODE_POINT]]

/** Sorted, with overlapping and touching runs joined; empty runs dropped. */
export function mergeRanges(ranges: Iterable<CodePointRange>): CodePointRange[] {
  const sorted = [...ranges]
    .filter(([first, last]) => first <= last)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged: [number, number][] = []
  for (const [first, last] of sorted) {
    const previous = merged.at(-1)
    if (previous !== undefined && first <= previous[1] + 1) {
      previous[1] = Math.max(previous[1], last)
    } else {
      merged.push([first, last])
    }
  }
  return merged
}

/** The code points in both lists, each sorted and merged. */
export function intersectRanges(
  a: readonly CodePointRange[],
  b: readonly CodePointRange[],
): CodePointRange[] {
  const both: CodePointRange[] = []
  let i = 0
  let j = 0
  for (;;) {
    const left = a[i]
    const right = b[j]
    if (left === undefined || right === undefined) return both
    const first = Math.max(left[0], right[0])
    const last = Math.min(left[1], right[1])
    if (first <= last) both.push([first, last])
    if (left[1] < right[1]) i++
    else j++
  }
}

/** Whether a sorted, merged list holds the code point. */
export function inRanges(ranges: readonly CodePointRange[], codePoint: number): boolean {
  let low = 0
  let high = ranges.length - 1
  while (low <= high) {
    const middle = (low + high) >>> 1
    const range = ranges[middle]
    if (range === undefined) return false
    if (codePoint < range[0]) high = middle - 1
    else if (codePoint > range[1]) low = middle + 1
    else return true
  }
  return false
}

const URANGE = /^u\+(?:([0-9a-f]{1,6})(?:-([0-9a-f]{1,6}))?|([0-9a-f]{0,5}\?{1,6}))$/i

/**
 * A unicode-range value (CSS Fonts 4 §4.5) as sorted, merged ranges: `U+26`, `U+0-7F` and
 * `U+4??`, separated by commas, as written in a stylesheet or as FontFace.unicodeRange gives it.
 * Null when a part is none of these or runs backwards, which makes the whole descriptor invalid.
 * Ranges past U+10FFFF are clipped to it.
 */
export function parseUnicodeRange(value: string): CodePointRange[] | null {
  const ranges: CodePointRange[] = []
  for (const part of value.split(',')) {
    const match = URANGE.exec(part.trim())
    if (match === null) return null
    const [, from, to, wildcard] = match
    let first: number
    let last: number
    if (wildcard !== undefined) {
      if (wildcard.length > 6) return null
      first = Number.parseInt(wildcard.replaceAll('?', '0'), 16)
      last = Number.parseInt(wildcard.replaceAll('?', 'f'), 16)
    } else {
      first = Number.parseInt(from ?? '', 16)
      last = to === undefined ? first : Number.parseInt(to, 16)
    }
    if (first > last) return null
    if (first > MAX_CODE_POINT) continue
    ranges.push([first, Math.min(last, MAX_CODE_POINT)])
  }
  return mergeRanges(ranges)
}
