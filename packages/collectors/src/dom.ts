import { html, type DefaultTreeAdapterTypes } from 'parse5'

export type Document = DefaultTreeAdapterTypes.Document
export type Element = DefaultTreeAdapterTypes.Element
export type Node = DefaultTreeAdapterTypes.Node
type ParentNode = DefaultTreeAdapterTypes.ParentNode

/** Same cap as the report schema's MAX_SNIPPET_LENGTH. */
export const SNIPPET_MAX_LENGTH = 300

/** 1-based, in the decoded page text. */
export interface SourceLocation {
  readonly line: number
  readonly column: number
}

/** Where an element is: enough for a finding's evidence. */
export interface ElementRef {
  readonly selector: string
  readonly location: SourceLocation | null
  /** The start tag as written, whitespace collapsed; null when the parser implied the element. */
  readonly snippet: string | null
}

export function isElement(node: Node): node is Element {
  return 'tagName' in node
}

export function isHtmlElement(node: Node, tagName: string): node is Element {
  return isElement(node) && node.tagName === tagName && node.namespaceURI === html.NS.HTML
}

export function attr(element: Element, name: string): string | null {
  for (const attribute of element.attrs) {
    if (attribute.name === name && attribute.prefix === undefined) return attribute.value
  }
  return null
}

export function locationOf(node: Node): SourceLocation | null {
  const location = node.sourceCodeLocation
  if (location === null || location === undefined) return null
  return { line: location.startLine, column: location.startCol }
}

export function collapseWhitespace(text: string): string {
  return text.replace(/[\t\n\f\r ]+/g, ' ').trim()
}

export function truncate(text: string, max = SNIPPET_MAX_LENGTH): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

/**
 * One pass over a parsed document: every element in document order, with its selector and
 * whether it sits in <head>. Iterative and linear, so a hostile page (tens of thousands of
 * siblings, thousands of nesting levels) costs no more than its size (M0.2 review).
 */
export class DocumentIndex {
  readonly document: Document
  /** Elements in document order; template contents are inert and left out. */
  readonly elements: readonly Element[]
  private readonly source: string
  private readonly selectors = new Map<Element, string>()
  private readonly head = new Set<Element>()

  constructor(document: Document, source: string) {
    this.document = document
    this.source = source
    const ordered: Element[] = []
    const idCounts = new Map<string, number>()
    /** Position among siblings with the same tag name, and how many there are. */
    const ofType = new Map<Element, { index: number; count: number }>()

    const stack: ParentNode[] = [document]
    for (let parent = stack.pop(); parent !== undefined; parent = stack.pop()) {
      const children = parent.childNodes.filter(isElement)
      const counts = new Map<string, number>()
      for (const child of children) {
        const index = (counts.get(child.tagName) ?? 0) + 1
        counts.set(child.tagName, index)
        ofType.set(child, { index, count: 0 })
      }
      for (const child of children) {
        const entry = ofType.get(child)
        if (entry !== undefined) entry.count = counts.get(child.tagName) ?? 1
      }
      if (parent !== document && isElement(parent)) ordered.push(parent)
      // Reversed, so the first child is visited next: document order.
      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i]
        if (child !== undefined) stack.push(child)
      }
    }
    for (const element of ordered) {
      const id = attr(element, 'id')
      if (id !== null) idCounts.set(id, (idCounts.get(id) ?? 0) + 1)
    }

    // Parents come before their children in document order, so their selectors are ready.
    for (const element of ordered) {
      const parent = element.parentNode
      const parentElement = parent !== null && isElement(parent) ? parent : null
      if (
        parentElement !== null &&
        (this.head.has(parentElement) || isHtmlElement(parentElement, 'head'))
      ) {
        this.head.add(element)
      }
      const id = attr(element, 'id')
      const tag = element.tagName
      let selector: string
      if (id !== null && CSS_IDENT.test(id) && idCounts.get(id) === 1) selector = `#${id}`
      else if (tag === 'html' || tag === 'head' || tag === 'body') selector = tag
      else {
        const position = ofType.get(element)
        const part =
          position === undefined || position.count === 1
            ? tag
            : `${tag}:nth-of-type(${position.index})`
        const prefix = parentElement === null ? undefined : this.selectors.get(parentElement)
        selector = prefix === undefined ? part : `${prefix} > ${part}`
      }
      this.selectors.set(element, selector)
    }
    this.elements = ordered
  }

  ref(element: Element): ElementRef {
    return {
      selector: this.selector(element),
      location: locationOf(element),
      snippet: this.snippet(element),
    }
  }

  /**
   * A CSS selector that matches only this element: tag names with :nth-of-type where needed,
   * starting from the nearest ancestor with a unique id, or from head/body/html.
   */
  selector(element: Element): string {
    return this.selectors.get(element) ?? element.tagName
  }

  /** Inside <head>, as the parser built it. */
  inHead(element: Element): boolean {
    return this.head.has(element)
  }

  snippet(element: Element): string | null {
    const startTag = element.sourceCodeLocation?.startTag
    if (startTag === undefined) return null
    return truncate(collapseWhitespace(this.source.slice(startTag.startOffset, startTag.endOffset)))
  }
}

const CSS_IDENT = /^[A-Za-z][\w-]*$/
