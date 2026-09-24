import type { DefaultTreeAdapterTypes } from 'parse5'

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

/** Elements in document order. Template contents are inert and are not visited. */
export function* elements(root: ParentNode): Generator<Element> {
  for (const child of root.childNodes) {
    if (!isElement(child)) continue
    yield child
    yield* elements(child)
  }
}

/** Builds selectors and snippets for one parsed document. */
export class DocumentIndex {
  readonly document: Document
  private readonly source: string
  private readonly idCounts = new Map<string, number>()

  constructor(document: Document, source: string) {
    this.document = document
    this.source = source
    for (const element of elements(document)) {
      const id = attr(element, 'id')
      if (id !== null) this.idCounts.set(id, (this.idCounts.get(id) ?? 0) + 1)
    }
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
    const parts: string[] = []
    let current: Element | null = element
    while (current !== null) {
      const id = attr(current, 'id')
      if (id !== null && CSS_IDENT.test(id) && this.idCounts.get(id) === 1) {
        parts.unshift(`#${id}`)
        break
      }
      const tag = current.tagName
      if (tag === 'html' || tag === 'head' || tag === 'body') {
        parts.unshift(tag)
        break
      }
      parts.unshift(nthOfType(current))
      const parent: Node | null = current.parentNode
      current = parent !== null && isElement(parent) ? parent : null
    }
    return parts.join(' > ')
  }

  snippet(element: Element): string | null {
    const startTag = element.sourceCodeLocation?.startTag
    if (startTag === undefined) return null
    return truncate(collapseWhitespace(this.source.slice(startTag.startOffset, startTag.endOffset)))
  }
}

const CSS_IDENT = /^[A-Za-z][\w-]*$/

function nthOfType(element: Element): string {
  const parent = element.parentNode
  if (parent === null) return element.tagName
  const sameType = parent.childNodes.filter(
    (sibling): sibling is Element => isElement(sibling) && sibling.tagName === element.tagName,
  )
  if (sameType.length === 1) return element.tagName
  return `${element.tagName}:nth-of-type(${sameType.indexOf(element) + 1})`
}
