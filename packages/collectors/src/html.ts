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

/** An h1–h6 element in the HTML namespace. */
export interface HeadingElement extends ElementRef {
  readonly level: 1 | 2 | 3 | 4 | 5 | 6
  /** Its text, with the alt text of images inside it, whitespace collapsed. */
  readonly text: string
}

/** An input, textarea or select: what the form rules need to tell fields apart. */
export interface FieldElement extends ElementRef {
  readonly tag: 'input' | 'textarea' | 'select'
  /** An input's type, lowercased, as HTML reads it (unknown or absent: "text"); else the tag. */
  readonly type: string
  readonly name: string | null
  readonly id: string | null
  /** Tokens of the autocomplete attribute, lowercased. */
  readonly autocomplete: readonly string[]
  /** Lowercased. */
  readonly inputmode: string | null
  /** As written. */
  readonly pattern: string | null
  readonly placeholder: string | null
  readonly dir: string | null
  /** The text of every <label> that labels the field, in document order; null when none does. */
  readonly label: string | null
  readonly ariaLabel: string | null
}

/**
 * An element that loads something over http:, or sends a form there: on an HTTPS page, mixed
 * content (W3C Mixed Content). Blockable loads (scripts, styles, frames, objects) browsers block;
 * images and media they upgrade to https: or load with a warning.
 */
export interface InsecureLoadElement extends ElementRef {
  readonly tag: string
  readonly attribute: string
  /** The http: URL, resolved against the document base URL. */
  readonly url: string
  readonly kind: 'blockable' | 'upgradable' | 'form'
}

export interface HtmlFacts {
  readonly encoding: EncodingInfo
  /** The document base URL: the first <base href>, else the page URL. */
  readonly baseUrl: string
  readonly root: RootElement
  /** null for frameset documents. */
  readonly body: RootElement | null
  readonly title: string | null
  /** Where that title is: the first <title> in the HTML namespace. */
  readonly titleElement: ElementRef | null
  readonly metas: readonly MetaElement[]
  readonly links: readonly LinkElement[]
  readonly anchors: readonly AnchorElement[]
  readonly scripts: readonly ScriptElement[]
  readonly headings: readonly HeadingElement[]
  readonly fields: readonly FieldElement[]
  /** The first MAX_INSECURE_LOADS, in document order. */
  readonly insecureLoads: readonly InsecureLoadElement[]
}

export interface HtmlOptions {
  /** application/xhtml+xml: there, xml:lang declares the language too. */
  readonly xhtml?: boolean
  /** Nodes the heading and label walks may visit in all. Default WALK_BUDGET. */
  readonly walkBudget?: number
}

/**
 * Nodes the heading and label walks may visit on one page. A real page uses a few thousand;
 * headings or labels nested in one another would walk the same subtree again for each, which is
 * quadratic in the depth, so past this a hostile page's walks stop. Counted, not timed, so the
 * same page gives the same facts.
 */
export const WALK_BUDGET = 500_000

/** What is left of a page's walk budget. */
interface Walk {
  left: number
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
  const headings: HeadingElement[] = []
  const fields: FieldElement[] = []
  const insecureLoads: InsecureLoadElement[] = []
  const walk: Walk = { left: options.walkBudget ?? WALK_BUDGET }
  const labels = labelsByField(all, walk)
  for (const element of all) {
    if (insecureLoads.length < MAX_INSECURE_LOADS && isHtmlElement(element, element.tagName)) {
      for (const load of insecureLoadsOf(element, baseUrl)) {
        if (insecureLoads.length < MAX_INSECURE_LOADS)
          insecureLoads.push({ ...index.ref(element), ...load })
      }
    }
    const level = HEADING_LEVELS.get(element.tagName)
    if (level !== undefined && isHtmlElement(element, element.tagName)) {
      headings.push({
        ...index.ref(element),
        level,
        text: collapseWhitespace(textOf(element, walk, true)),
      })
      continue
    }
    if (FIELD_TAGS.has(element.tagName) && isHtmlElement(element, element.tagName)) {
      const tag = element.tagName as FieldElement['tag']
      const label = labels.get(element)
      fields.push({
        ...index.ref(element),
        tag,
        type: tag === 'input' ? inputType(attr(element, 'type')) : tag,
        name: attr(element, 'name'),
        id: attr(element, 'id'),
        autocomplete: tokens(attr(element, 'autocomplete')),
        inputmode: lowerOrNull(attr(element, 'inputmode')),
        pattern: attr(element, 'pattern'),
        placeholder: attr(element, 'placeholder'),
        dir: attr(element, 'dir'),
        label: label === undefined ? null : label.join(' '),
        ariaLabel: attr(element, 'aria-label'),
      })
      continue
    }
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
    // The title walks on its own budget: a hostile page's headings cannot make it look empty.
    title:
      titleElement === undefined
        ? null
        : collapseWhitespace(textOf(titleElement, { left: WALK_BUDGET })),
    titleElement: titleElement === undefined ? null : index.ref(titleElement),
    metas,
    links,
    anchors,
    scripts,
    headings,
    fields,
    insecureLoads,
  }
}

export const MAX_INSECURE_LOADS = 100

/** Attributes that load a resource, by element, and how browsers treat them over http:. */
const LOADS: Readonly<Record<string, readonly (readonly [string, InsecureLoadElement['kind']])[]>> =
  {
    script: [['src', 'blockable']],
    iframe: [['src', 'blockable']],
    frame: [['src', 'blockable']],
    object: [['data', 'blockable']],
    embed: [['src', 'blockable']],
    img: [
      ['src', 'upgradable'],
      ['srcset', 'upgradable'],
    ],
    source: [
      ['src', 'upgradable'],
      ['srcset', 'upgradable'],
    ],
    video: [
      ['src', 'upgradable'],
      ['poster', 'upgradable'],
    ],
    audio: [['src', 'upgradable']],
    track: [['src', 'upgradable']],
    form: [['action', 'form']],
    button: [['formaction', 'form']],
    input: [['formaction', 'form']],
  }

/** The http: loads of one element: a stylesheet or icon link too, and each candidate of a srcset. */
function insecureLoadsOf(
  element: Element,
  baseUrl: string,
): Omit<InsecureLoadElement, keyof ElementRef>[] {
  const loads: Omit<InsecureLoadElement, keyof ElementRef>[] = []
  const check = (attribute: string, kind: InsecureLoadElement['kind'], value: string) => {
    const url = resolve(value.trim(), baseUrl)
    if (url?.startsWith('http:') === true)
      loads.push({ tag: element.tagName, attribute, url, kind })
  }
  if (element.tagName === 'link') {
    const rel = tokens(attr(element, 'rel'))
    const href = attr(element, 'href')
    if (href !== null && rel.includes('stylesheet')) check('href', 'blockable', href)
    else if (href !== null && rel.includes('icon')) check('href', 'upgradable', href)
    return loads
  }
  for (const [attribute, kind] of LOADS[element.tagName] ?? []) {
    const value = attr(element, attribute)
    if (value === null || value.trim() === '') continue
    if (attribute === 'srcset') {
      // Each candidate is a URL and an optional descriptor, separated by commas.
      for (const candidate of value.split(',')) {
        const url = candidate.trim().split(/\s+/)[0]
        if (url !== undefined && url !== '') check(attribute, kind, url)
      }
    } else {
      check(attribute, kind, value)
    }
  }
  return loads
}

const HEADING_LEVELS = new Map<string, HeadingElement['level']>([
  ['h1', 1],
  ['h2', 2],
  ['h3', 3],
  ['h4', 4],
  ['h5', 5],
  ['h6', 6],
])
const FIELD_TAGS = new Set(['input', 'textarea', 'select'])

/** HTML's input types; any other value, or none, is the Text state. */
const INPUT_TYPES = new Set([
  'hidden',
  'text',
  'search',
  'tel',
  'url',
  'email',
  'password',
  'date',
  'month',
  'week',
  'time',
  'datetime-local',
  'number',
  'range',
  'color',
  'checkbox',
  'radio',
  'file',
  'submit',
  'image',
  'reset',
  'button',
])

function inputType(value: string | null): string {
  const type = value?.trim().toLowerCase() ?? ''
  return INPUT_TYPES.has(type) ? type : 'text'
}

/** Elements a <label> can label (HTML "labelable elements"), hidden inputs aside. */
function isLabelable(element: Element): boolean {
  if (!isHtmlElement(element, element.tagName)) return false
  switch (element.tagName) {
    case 'button':
    case 'meter':
    case 'output':
    case 'progress':
    case 'select':
    case 'textarea':
      return true
    case 'input':
      return inputType(attr(element, 'type')) !== 'hidden'
    default:
      return false
  }
}

/**
 * The text of the labels of each field, as HTML ties them: a label with a for attribute labels
 * the first element with that id; one without labels its first labelable descendant.
 */
function labelsByField(all: readonly Element[], walk: Walk): Map<Element, string[]> {
  const byId = new Map<string, Element>()
  for (const element of all) {
    const id = attr(element, 'id')
    if (id !== null && !byId.has(id)) byId.set(id, element)
  }
  const labels = new Map<Element, string[]>()
  for (const label of all) {
    if (!isHtmlElement(label, 'label')) continue
    const target = labelTarget(label, byId, walk)
    if (target === null) continue
    const text = collapseWhitespace(textOf(label, walk, false, FIELD_TEXT))
    if (text === '') continue
    const list = labels.get(target)
    if (list === undefined) labels.set(target, [text])
    else list.push(text)
  }
  return labels
}

function labelTarget(
  label: Element,
  byId: ReadonlyMap<string, Element>,
  walk: Walk,
): Element | null {
  const htmlFor = attr(label, 'for')
  if (htmlFor !== null) {
    const target = byId.get(htmlFor)
    return target !== undefined && isLabelable(target) ? target : null
  }
  const stack: Node[] = [...label.childNodes].reverse()
  for (let node = stack.pop(); node !== undefined && walk.left > 0; node = stack.pop()) {
    walk.left--
    if (!isElement(node)) continue
    if (isLabelable(node)) return node
    for (let i = node.childNodes.length - 1; i >= 0; i--) {
      const child = node.childNodes[i]
      if (child !== undefined) stack.push(child)
    }
  }
  return null
}

/** The text of a label leaves out what fields inside it show (a select's options). */
const FIELD_TEXT: ReadonlySet<string> = new Set(['select', 'textarea'])

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

/**
 * Descendant text in document order, with an explicit stack; with `alt`, images add their alt
 * text, as screen readers read them. Elements named in `skip` add nothing.
 */
function textOf(
  element: Element,
  walk: Walk,
  alt = false,
  skip: ReadonlySet<string> = NO_TAGS,
): string {
  let text = ''
  const stack: Node[] = [...element.childNodes].reverse()
  for (let node = stack.pop(); node !== undefined && walk.left > 0; node = stack.pop()) {
    walk.left--
    if (node.nodeName === '#text' && 'value' in node) text += node.value
    else if (isElement(node)) {
      if (skip.has(node.tagName)) continue
      if (alt && node.tagName === 'img') text += ` ${attr(node, 'alt') ?? ''} `
      for (let i = node.childNodes.length - 1; i >= 0; i--) {
        const child = node.childNodes[i]
        if (child !== undefined) stack.push(child)
      }
    }
  }
  return text
}

const NO_TAGS: ReadonlySet<string> = new Set()

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
