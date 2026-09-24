import {
  attr,
  collapseWhitespace,
  elements,
  isElement,
  locationOf,
  type DocumentIndex,
  type Element,
  type ElementRef,
  type SourceLocation,
} from './dom'
import type { EncodingInfo } from './encoding'

/** <html> or <body>: the elements that carry the page's language and direction. */
export interface RootElement extends ElementRef {
  /** The attribute as written; null when absent. */
  readonly lang: string | null
  readonly dir: string | null
}

export interface MetaElement extends ElementRef {
  /** Lowercased. */
  readonly name: string | null
  /** Lowercased. */
  readonly httpEquiv: string | null
  readonly content: string | null
  readonly charset: string | null
  readonly property: string | null
  readonly inHead: boolean
}

export interface LinkElement extends ElementRef {
  /** Tokens of the rel attribute, lowercased. */
  readonly rel: readonly string[]
  /** As written. */
  readonly href: string | null
  /** Resolved against the document base URL; null when absent or unresolvable. */
  readonly url: string | null
  readonly hreflang: string | null
  readonly inHead: boolean
}

export interface AnchorElement extends ElementRef {
  readonly tag: 'a' | 'area'
  readonly href: string
  readonly url: string | null
}

export interface ScriptElement extends ElementRef {
  readonly type: string | null
  readonly src: string | null
  /** The script's source text, exactly as in the page. */
  readonly text: string
  /** Where that text starts. */
  readonly textLocation: SourceLocation | null
  readonly inHead: boolean
}

export interface HtmlFacts {
  readonly encoding: EncodingInfo
  /** The document base URL: the first <base href>, else the page URL. */
  readonly baseUrl: string
  readonly root: RootElement
  /** null for frameset documents. */
  readonly body: RootElement | null
  readonly title: string | null
  readonly metas: readonly MetaElement[]
  readonly links: readonly LinkElement[]
  readonly anchors: readonly AnchorElement[]
  readonly scripts: readonly ScriptElement[]
}

export function collectHtml(
  index: DocumentIndex,
  pageUrl: string,
  encoding: EncodingInfo,
): HtmlFacts {
  const all = [...elements(index.document)]
  const root = all.find((element) => element.tagName === 'html')
  if (root === undefined) throw new Error('parse5 always creates an <html> element')
  const head = all.find((element) => element.tagName === 'head')
  const body = all.find((element) => element.tagName === 'body')
  const inHead = (element: Element) => head !== undefined && isInside(element, head)
  const baseUrl = documentBaseUrl(all, pageUrl)
  const titleElement = all.find((element) => element.tagName === 'title')

  const metas: MetaElement[] = []
  const links: LinkElement[] = []
  const anchors: AnchorElement[] = []
  const scripts: ScriptElement[] = []
  for (const element of all) {
    switch (element.tagName) {
      case 'meta':
        metas.push({
          ...index.ref(element),
          name: lowerOrNull(attr(element, 'name')),
          httpEquiv: lowerOrNull(attr(element, 'http-equiv')),
          content: attr(element, 'content'),
          charset: attr(element, 'charset'),
          property: attr(element, 'property'),
          inHead: inHead(element),
        })
        break
      case 'link': {
        const href = attr(element, 'href')
        links.push({
          ...index.ref(element),
          rel: tokens(attr(element, 'rel')),
          href,
          url: href === null ? null : resolve(href, baseUrl),
          hreflang: attr(element, 'hreflang'),
          inHead: inHead(element),
        })
        break
      }
      case 'a':
      case 'area': {
        const href = attr(element, 'href')
        if (href !== null) {
          anchors.push({
            ...index.ref(element),
            tag: element.tagName,
            href,
            url: resolve(href, baseUrl),
          })
        }
        break
      }
      case 'script': {
        const textNodes = element.childNodes.filter((child) => child.nodeName === '#text')
        scripts.push({
          ...index.ref(element),
          type: attr(element, 'type'),
          src: attr(element, 'src'),
          text: textNodes.map((child) => ('value' in child ? child.value : '')).join(''),
          textLocation: textNodes[0] === undefined ? null : locationOf(textNodes[0]),
          inHead: inHead(element),
        })
        break
      }
    }
  }

  return {
    encoding,
    baseUrl,
    root: rootElement(index, root),
    body: body === undefined ? null : rootElement(index, body),
    title: titleElement === undefined ? null : collapseWhitespace(textOf(titleElement)),
    metas,
    links,
    anchors,
    scripts,
  }
}

function rootElement(index: DocumentIndex, element: Element): RootElement {
  return { ...index.ref(element), lang: attr(element, 'lang'), dir: attr(element, 'dir') }
}

/** HTML: the frozen base URL comes from the first <base> with an href, resolved against the page URL. */
function documentBaseUrl(all: readonly Element[], pageUrl: string): string {
  const base = all.find((element) => element.tagName === 'base' && attr(element, 'href') !== null)
  const href = base === undefined ? null : attr(base, 'href')
  return (href === null ? null : resolve(href, pageUrl)) ?? pageUrl
}

function isInside(element: Element, ancestor: Element): boolean {
  for (
    let node = element.parentNode;
    node !== null;
    node = 'parentNode' in node ? node.parentNode : null
  ) {
    if (node === ancestor) return true
  }
  return false
}

function textOf(element: Element): string {
  let text = ''
  for (const child of element.childNodes) {
    if (child.nodeName === '#text' && 'value' in child) text += child.value
    else if (isElement(child)) text += textOf(child)
  }
  return text
}

function tokens(value: string | null): string[] {
  if (value === null) return []
  return value
    .toLowerCase()
    .split(/[\t\n\f\r ]+/)
    .filter((token) => token !== '')
}

function lowerOrNull(value: string | null): string | null {
  return value === null ? null : value.trim().toLowerCase()
}

export function resolve(href: string, base: string): string | null {
  try {
    return new URL(href, base).href
  } catch {
    return null
  }
}
