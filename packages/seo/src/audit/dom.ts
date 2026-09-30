import { parse, type DefaultTreeAdapterMap } from 'parse5'

type Node = DefaultTreeAdapterMap['node']
type Element = DefaultTreeAdapterMap['element']

/** An element of a parsed page, with what the audit asks about it. */
export interface Tag {
  readonly name: string
  readonly node: Element
  /** Position in document order. */
  readonly order: number
  readonly inHead: boolean
  attr(name: string): string | null
}

/** Every element of the page in document order (template contents are not part of the page). */
export function tagsOf(html: string): Tag[] {
  const tags: Tag[] = []
  const stack: { node: Node; inHead: boolean }[] = [{ node: parse(html), inHead: false }]
  for (let entry = stack.pop(); entry !== undefined; entry = stack.pop()) {
    const { node } = entry
    let inHead = entry.inHead
    if ('tagName' in node) {
      inHead ||= node.tagName === 'head'
      const attrs = new Map(node.attrs.map((attribute) => [attribute.name, attribute.value]))
      tags.push({
        name: node.tagName,
        node,
        order: tags.length,
        inHead,
        attr: (name) => attrs.get(name) ?? null,
      })
    }
    if ('childNodes' in node) {
      for (let i = node.childNodes.length - 1; i >= 0; i--) {
        const child = node.childNodes[i]
        if (child !== undefined) stack.push({ node: child, inHead })
      }
    }
  }
  return tags
}

/** The text inside a node, with whitespace collapsed. */
export function textOf(root: Node): string {
  const parts: string[] = []
  const stack: Node[] = [root]
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    if (node.nodeName === '#text' && 'value' in node) parts.push(node.value)
    if ('childNodes' in node) {
      for (let i = node.childNodes.length - 1; i >= 0; i--) {
        const child = node.childNodes[i]
        if (child !== undefined) stack.push(child)
      }
    }
  }
  return parts.join('').replace(/\s+/g, ' ').trim()
}

/** Whether `node` is inside `ancestor` (or is it). */
export function isWithin(node: Node, ancestor: Node): boolean {
  for (let current: Node | null = node; current !== null;) {
    if (current === ancestor) return true
    current = 'parentNode' in current ? current.parentNode : null
  }
  return false
}
