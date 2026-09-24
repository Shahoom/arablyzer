import {
  attr,
  isElement,
  locationOf,
  type DocumentIndex,
  type Element,
  type SourceLocation,
} from './dom'

export type DominantScript = 'arabic' | 'latin' | 'other' | 'none'

export interface LetterCounts {
  readonly arabic: number
  readonly latin: number
  readonly other: number
  readonly total: number
}

/** One visible text node. */
export interface TextSegment {
  /** Entity-decoded, as in the DOM. */
  readonly text: string
  /**
   * The character rendered right before this text when only inline elements separate them
   * (`<b>نص</b>, …`); '' at the start of a block.
   */
  readonly precededBy: string
  /** The parent element. */
  readonly selector: string
  readonly location: SourceLocation | null
  /** Inside code, pre, kbd, samp, tt or var, where any punctuation may be literal. */
  readonly code: boolean
}

export interface TextFacts {
  /** Letters (Unicode category L) in visible body text, by script. */
  readonly letters: LetterCounts
  /** The script with the most letters; 'none' without letters. */
  readonly dominantScript: DominantScript
  readonly segments: readonly TextSegment[]
}

/** Never rendered as page text. */
const HIDDEN_TAGS = new Set([
  'head',
  'script',
  'style',
  'noscript',
  'template',
  'textarea',
  'iframe',
  'object',
  'title',
])
const CODE_TAGS = new Set(['code', 'pre', 'kbd', 'samp', 'tt', 'var'])
/** Text-level elements: text on both sides of them runs on as one line. */
const INLINE_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'big',
  'cite',
  'code',
  'data',
  'del',
  'dfn',
  'em',
  'font',
  'i',
  'ins',
  'kbd',
  'label',
  'mark',
  'nobr',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'time',
  'tt',
  'u',
  'var',
])
const DISPLAY_NONE = /(?:^|;)\s*display\s*:\s*none\s*(?:!important\s*)?(?:;|$)/i

const LETTER = /\p{L}/gu
const ARABIC = /\p{Script=Arabic}/u
const LATIN = /\p{Script=Latin}/u

interface Frame {
  readonly element: Element
  next: number
  readonly code: boolean
  readonly inline: boolean
}

/**
 * Visible text of <body> in the raw HTML: no scripts, styles, templates, `hidden` elements or
 * inline `display: none`. CSS from stylesheets is not applied until the browser collectors
 * (Phase 1), so text hidden by classes still counts. Walks the tree with its own stack, so deep
 * nesting cannot exhaust the call stack.
 */
export function collectText(index: DocumentIndex): TextFacts {
  const body = findBody(index)
  const segments: TextSegment[] = []
  const counts = { arabic: 0, latin: 0, other: 0 }
  let lastChar = ''

  const stack: Frame[] =
    body === null ? [] : [{ element: body, next: 0, code: false, inline: false }]
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]
    if (frame === undefined) break
    const child = frame.element.childNodes[frame.next++]
    if (child === undefined) {
      stack.pop()
      if (!frame.inline) lastChar = ''
      continue
    }
    if (child.nodeName === '#text' && 'value' in child) {
      const text = child.value
      if (text.trim() !== '') {
        segments.push({
          text,
          precededBy: lastChar,
          selector: index.selector(frame.element),
          location: locationOf(child),
          code: frame.code,
        })
        for (const [letter] of text.matchAll(LETTER)) {
          if (ARABIC.test(letter)) counts.arabic++
          else if (LATIN.test(letter)) counts.latin++
          else counts.other++
        }
      }
      lastChar = text.at(-1) ?? lastChar
      continue
    }
    if (!isElement(child) || isHidden(child)) continue
    const inline = INLINE_TAGS.has(child.tagName)
    if (!inline) lastChar = ''
    stack.push({
      element: child,
      next: 0,
      code: frame.code || CODE_TAGS.has(child.tagName),
      inline,
    })
  }

  const total = counts.arabic + counts.latin + counts.other
  return {
    letters: { ...counts, total },
    dominantScript: dominant(counts, total),
    segments,
  }
}

function findBody(index: DocumentIndex): Element | null {
  const html = index.document.childNodes.find(
    (node): node is Element => isElement(node) && node.tagName === 'html',
  )
  const body = html?.childNodes.find(
    (node): node is Element => isElement(node) && node.tagName === 'body',
  )
  return body ?? null
}

function isHidden(element: Element): boolean {
  if (HIDDEN_TAGS.has(element.tagName)) return true
  if (attr(element, 'hidden') !== null) return true
  const style = attr(element, 'style')
  return style !== null && DISPLAY_NONE.test(style)
}

/** Ties go to Arabic, then Latin, so the result never depends on iteration order. */
function dominant(
  counts: { arabic: number; latin: number; other: number },
  total: number,
): DominantScript {
  if (total === 0) return 'none'
  if (counts.arabic >= counts.latin && counts.arabic >= counts.other) return 'arabic'
  if (counts.latin >= counts.other) return 'latin'
  return 'other'
}
