import {
  attr,
  collapseWhitespace,
  isElement,
  isHtmlElement,
  locationOf,
  type DocumentIndex,
  type Element,
  type ElementRef,
  type Node,
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

export interface HtmlOptions {
  /** application/xhtml+xml: there, xml:lang declares the language too. */
  readonly xhtml?: boolean
}

export function collectHtml(
  index: DocumentIndex,
  pageUrl: string,
  encoding: EncodingInfo,
  options: HtmlOptions = {},
): HtmlFacts {
  const all = index.elements
  const root = all.find((element) => element.tagName === 'html')
  if (root === undefined) throw new Error('parse5 always creates an <html> element')
  const body = all.find((element) => isHtmlElement(element, 'body'))
  const inHead = (element: Element) => index.inHead(element)
  const baseUrl = documentBaseUrl(all, pageUrl)
  // The document's title is its first title element in the HTML namespace, not an SVG <title>.
  const titleElement = all.find((element) => isHtmlElement(element, 'title'))

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
    root: rootElement(index, root, options.xhtml === true),
    body: body === undefined ? null : rootElement(index, body, options.xhtml === true),
    title: titleElement === undefined ? null : collapseWhitespace(textOf(titleElement)),
    metas,
    links,
    anchors,
    scripts,
  }
}

function rootElement(index: DocumentIndex, element: Element, xhtml: boolean): RootElement {
  // In XHTML documents xml:lang sets the language when lang is absent; in text/html it does not.
  const lang = attr(element, 'lang') ?? (xhtml ? attr(element, 'xml:lang') : null)
  return { ...index.ref(element), lang, dir: attr(element, 'dir') }
}

/**
 * HTML "set the frozen base URL": the first <base> with an href, resolved against the page URL,
 * unless that fails or gives a data: or javascript: URL, which fall back to the page URL.
 */
function documentBaseUrl(all: readonly Element[], pageUrl: string): string {
  const base = all.find((element) => element.tagName === 'base' && attr(element, 'href') !== null)
  const href = base === undefined ? null : attr(base, 'href')
  const resolved = href === null ? null : resolve(href, pageUrl)
  if (resolved === null) return pageUrl
  const scheme = new URL(resolved).protocol
  return scheme === 'data:' || scheme === 'javascript:' ? pageUrl : resolved
}

/** Descendant text in document order, with an explicit stack. */
function textOf(element: Element): string {
  let text = ''
  const stack: Node[] = [...element.childNodes].reverse()
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    if (node.nodeName === '#text' && 'value' in node) text += node.value
    else if (isElement(node)) {
      for (let i = node.childNodes.length - 1; i >= 0; i--) {
        const child = node.childNodes[i]
        if (child !== undefined) stack.push(child)
      }
    }
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
