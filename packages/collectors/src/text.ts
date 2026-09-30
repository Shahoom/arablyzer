import { defaultTreeAdapter, type DefaultTreeAdapterTypes } from 'parse5'
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
  /**
   * The text of the body that `segments` leaves out because a page does not show it as sent: in a
   * `hidden` element or one with an inline `display: none`, in `<noscript>`, `<template>`,
   * `<textarea>`, `<iframe>` or `<object>`. It is in the HTML all the same, and a rule that asks
   * whether a word is there (js-only-content, M2.3c review) reads it. Only the text nodes with an
   * Arabic letter are kept; scripts and styles are code, and are not text.
   */
  readonly hidden: readonly string[]
}

/** Code, not text: neither shown nor counted as hidden text. */
const CODE_ONLY_TAGS = new Set(['script', 'style'])
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

type ParentNode = DefaultTreeAdapterTypes.ParentNode

interface Frame {
  /** The element whose children are walked; a template's content is walked in its place. */
  readonly element: Element
  readonly children: ParentNode
  next: number
  readonly code: boolean
  readonly inline: boolean
  /** Inside something the page does not show: its text is `hidden`, not `segments`. */
  readonly hidden: boolean
}

/**
 * Visible text of <body> in the raw HTML: no scripts, styles, templates, `hidden` elements or
 * inline `display: none`. CSS from stylesheets is not applied until the browser collectors
 * (Phase 1), so text hidden by classes still counts. What the page does not show as sent is kept
 * apart, as `hidden`. Walks the tree with its own stack, so deep nesting cannot exhaust the call
 * stack.
 */
export function collectText(index: DocumentIndex): TextFacts {
  const body = findBody(index)
  const segments: TextSegment[] = []
  const counts = { arabic: 0, latin: 0, other: 0 }
  let lastChar = ''

  const hidden: string[] = []
  const stack: Frame[] =
    body === null
      ? []
      : [{ element: body, children: body, next: 0, code: false, inline: false, hidden: false }]
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]
    if (frame === undefined) break
    const child = frame.children.childNodes[frame.next++]
    if (child === undefined) {
      stack.pop()
      // What the page does not show is not a line of text to break.
      if (!frame.inline && !frame.hidden) lastChar = ''
      continue
    }
    if (child.nodeName === '#text' && 'value' in child) {
      const text = child.value
      if (frame.hidden) {
        if (ARABIC.test(text)) hidden.push(text)
        continue
      }
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
    if (!isElement(child) || CODE_ONLY_TAGS.has(child.tagName)) continue
    const away = frame.hidden || isHidden(child)
    const inline = INLINE_TAGS.has(child.tagName)
    if (!away && !inline) lastChar = ''
    stack.push({
      element: child,
      // A template's children are in its content, which is a fragment of its own.
      children: isTemplate(child) ? defaultTreeAdapter.getTemplateContent(child) : child,
      next: 0,
      code: frame.code || CODE_TAGS.has(child.tagName),
      inline,
      hidden: away,
    })
  }

  const total = counts.arabic + counts.latin + counts.other
  return {
    letters: { ...counts, total },
    dominantScript: dominant(counts, total),
    segments,
    hidden,
  }
}

function isTemplate(element: Element): element is DefaultTreeAdapterTypes.Template {
  return element.tagName === 'template' && 'content' in element
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
