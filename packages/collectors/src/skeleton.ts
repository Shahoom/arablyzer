import { isElement, isHtmlElement, type DocumentIndex, type Element } from './dom'

/**
 * The tags that make a page's frame (M4.5): the regions and the blocks a template repeats. A
 * paragraph or a link says what a page is about; these say how it is built.
 */
const STRUCTURAL: ReadonlySet<string> = new Set([
  'header',
  'nav',
  'main',
  'article',
  'section',
  'aside',
  'footer',
  'form',
  'ul',
  'ol',
  'table',
  'figure',
  'dl',
  'details',
  'blockquote',
  'h1',
  'h2',
])

/** The structural ancestors a path keeps: deeper ones add nothing a template tells apart by. */
export const SKELETON_DEPTH = 5
/** A skeleton is cut here, at a path boundary, so it stays small whatever the page holds. */
export const SKELETON_MAX_LENGTH = 800

interface Chain {
  readonly path: string
  readonly depth: number
}
const ROOT: Chain = { path: '', depth: 0 }

/**
 * A page's skeleton: the set of paths of its structural elements, such as `main>section>ul`, each
 * once and sorted, joined by spaces. How many times a block repeats is left out, so a list of
 * three products and one of thirty have the same skeleton; where the blocks sit is not. Pages of
 * one template share most of their paths, and `skeletonSimilarity` says how many. One pass over
 * the elements in document order, linear in the page, and the same for the same page.
 */
export function skeletonOf(index: DocumentIndex): string {
  const chains = new Map<Element, Chain>()
  const paths = new Set<string>()
  for (const element of index.elements) {
    if (index.inHead(element)) continue
    const parent = element.parentNode
    const above = parent !== null && isElement(parent) ? (chains.get(parent) ?? ROOT) : ROOT
    if (
      STRUCTURAL.has(element.tagName) &&
      isHtmlElement(element, element.tagName) &&
      above.depth < SKELETON_DEPTH
    ) {
      const path = above.path === '' ? element.tagName : `${above.path}>${element.tagName}`
      chains.set(element, { path, depth: above.depth + 1 })
      paths.add(path)
    } else {
      chains.set(element, above)
    }
  }
  let skeleton = ''
  for (const path of [...paths].sort()) {
    const next = skeleton === '' ? path : `${skeleton} ${path}`
    if (next.length > SKELETON_MAX_LENGTH) break
    skeleton = next
  }
  return skeleton
}

/** How alike two skeletons are, 0 to 1: the paths they share over the paths either has. */
export function skeletonSimilarity(a: string, b: string): number {
  if (a === b) return 1
  const left = new Set(a === '' ? [] : a.split(' '))
  const right = new Set(b === '' ? [] : b.split(' '))
  if (left.size === 0 && right.size === 0) return 1
  let shared = 0
  for (const path of left) if (right.has(path)) shared++
  return shared / (left.size + right.size - shared)
}
