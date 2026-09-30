import type { PageFacts, ScriptElement, SourceLocation } from '@arablyzer/collectors'

/** <script type="application/ld+json">, with any letter case and parameters. */
export function jsonLdBlocks(page: PageFacts): ScriptElement[] {
  return (page.html?.scripts ?? []).filter(
    (script) => (script.type ?? '').split(';')[0]?.trim().toLowerCase() === 'application/ld+json',
  )
}

/** Where an offset in the script text is in the page; relative to the block without a location. */
export function documentPosition(script: ScriptElement, offset: number): SourceLocation {
  const start = script.textLocation ?? { line: 1, column: 1 }
  const before = script.text.slice(0, offset)
  const newlines = before.split('\n').length - 1
  if (newlines === 0) return { line: start.line, column: start.column + offset }
  return { line: start.line + newlines, column: offset - before.lastIndexOf('\n') }
}

/** The line of JSON with the problem, or the last non-empty line before it. */
export function lineAround(text: string, offset: number): string {
  const lines = text.slice(0, offset).split('\n')
  const current = `${lines.at(-1) ?? ''}${text.slice(offset).split('\n')[0] ?? ''}`
  for (const line of [current, ...lines.slice(0, -1).reverse()]) {
    const trimmed = line.trim().replace(/\s+/g, ' ')
    if (trimmed !== '') return trimmed
  }
  return ''
}

/** Characters of a line shown before and after an offset: a minified block is one long line. */
const SNIPPET_BEFORE = 60
const SNIPPET_AFTER = 120

export interface TextPlacer {
  /** Where an offset in the script text is in the page, as documentPosition says. */
  position(offset: number): SourceLocation
  /** The line around an offset, whitespace collapsed, cut to a window with … on a long line. */
  line(offset: number): string
}

/**
 * Places many offsets of one script's text: the line starts are found once, and each offset by
 * binary search, so a block with thousands of findings is not re-read for each.
 */
export function textPlacer(script: ScriptElement): TextPlacer {
  const { text } = script
  const starts = [0]
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) starts.push(at + 1)
  const origin = script.textLocation ?? { line: 1, column: 1 }
  const lineOf = (offset: number): number => {
    let low = 0
    let high = starts.length - 1
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if ((starts[middle] ?? 0) <= offset) low = middle
      else high = middle - 1
    }
    return low
  }
  return {
    position: (offset) => {
      const index = lineOf(offset)
      if (index === 0) return { line: origin.line, column: origin.column + offset }
      return { line: origin.line + index, column: offset - (starts[index] ?? 0) + 1 }
    },
    line: (offset) => {
      const index = lineOf(offset)
      const start = starts[index] ?? 0
      const end = (starts[index + 1] ?? text.length + 1) - 1
      let from = Math.max(start, offset - SNIPPET_BEFORE)
      let to = Math.min(end, offset + SNIPPET_AFTER)
      // Never split a surrogate pair at either edge of the window.
      if (from > start && isLowSurrogate(text.charCodeAt(from))) from++
      if (to < end && isLowSurrogate(text.charCodeAt(to))) to--
      const piece = text.slice(from, to).trim().replace(/\s+/g, ' ')
      return `${from > start ? '…' : ''}${piece}${to < end ? '…' : ''}`
    },
  }
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff
}
