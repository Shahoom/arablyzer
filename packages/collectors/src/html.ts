import { html as namespaces } from 'parse5'
import {
  attr,
  collapseWhitespace,
  isElement,
  isHtmlElement,
  locationOf,
  truncate,
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
 * A form that looks like a site's search: marked as one (`role="search"`, or in an element that is,
 * or `<search>`), or with an `input[type=search]` or a text field named like a query. Its action as
 * the page's address resolves it, its method, and the field that takes the query.
 */
export interface SearchFormElement extends ElementRef {
  /** Resolved against the document base URL; the page's own URL when the form has no action. */
  readonly action: string
  readonly method: 'get' | 'post'
  /** The field's name: the query parameter of a GET form. */
  readonly field: string
  readonly marked: boolean
}

/**
 * An element that loads something over http:, or sends a form there: on an HTTPS page, mixed
 * content (W3C Mixed Content). Images, audio and video browsers upgrade to https: (or load with a
 * warning); everything else they block, and images too when chosen by srcset or <picture> or on
 * an IP address (Mixed Content §4.1).
 */
export interface InsecureLoadElement extends ElementRef {
  readonly tag: string
  readonly attribute: string
  /** The http: URL, resolved against the document base URL. */
  readonly url: string
  readonly kind: 'blockable' | 'upgradable' | 'form'
}

/**
 * A name the page gives a graphic or a control for those who cannot see it (M2.3c): an image's
 * `alt` (`<img>`, `<area>`, `<input type="image">`), an `<svg>`'s `<title>`, or an `aria-label`.
 */
export interface TextAlternative extends ElementRef {
  readonly tag: string
  readonly source: 'alt' | 'svg-title' | 'aria-label'
  /** Whitespace collapsed, at most SNIPPET_MAX_LENGTH characters; never empty. */
  readonly text: string
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
  /** The forms that look like a search (the first 10). */
  readonly searchForms: readonly SearchFormElement[]
  /** The first MAX_INSECURE_LOADS, in document order. */
  readonly insecureLoads: readonly InsecureLoadElement[]
  /**
   * The first MAX_TEXT_ALTERNATIVES and the last MAX_TEXT_ALTERNATIVES, in document order: a
   * store's payment logos sit in its footer, after every product image.
   */
  readonly textAlternatives: readonly TextAlternative[]
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
  const searchForms: SearchFormElement[] = []
  const insecureLoads: InsecureLoadElement[] = []
  const firstAlternatives: TextAlternative[] = []
  const lastAlternatives = new LastKept<TextAlternative>(MAX_TEXT_ALTERNATIVES)
  const walk: Walk = { left: options.walkBudget ?? WALK_BUDGET }
  const labels = labelsByField(all, walk)
  const forms = formIds(all)
  for (const element of all) {
    for (const [source, text] of textAlternativesOf(element)) {
      const alternative = { ...index.ref(element), tag: element.tagName, source, text }
      if (firstAlternatives.length < MAX_TEXT_ALTERNATIVES) firstAlternatives.push(alternative)
      else lastAlternatives.add(alternative)
    }
    if (insecureLoads.length < MAX_INSECURE_LOADS && isHtmlElement(element, element.tagName)) {
      for (const load of insecureLoadsOf(element, baseUrl, forms)) {
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
      case 'form': {
        if (searchForms.length < MAX_SEARCH_FORMS && isHtmlElement(element, 'form')) {
          const found = searchFormOf(element, baseUrl, pageUrl, walk)
          if (found !== null) searchForms.push({ ...index.ref(element), ...found })
        }
        break
      }
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
    searchForms,
    insecureLoads,
    textAlternatives: [...firstAlternatives, ...lastAlternatives.toArray()],
  }
}

export const MAX_INSECURE_LOADS = 100
export const MAX_SEARCH_FORMS = 10

/** Names of a text field that takes a search query. */
const QUERY_NAMES = new Set(['s', 'q', 'query', 'search', 'keyword', 'keywords', 'term', 'text'])

/** Whether the element, or an element it is in, says it is a search (role="search" or <search>). */
function markedSearch(element: Element): boolean {
  for (let node: Node | null = element; node !== null && isElement(node); node = node.parentNode) {
    if (node.tagName === 'search' || attr(node, 'role')?.trim().toLowerCase() === 'search') {
      return true
    }
  }
  return false
}

/**
 * What a form needs to be asked as a search (docs/design/plans/arabic-native.md §2): the field
 * that takes the query, from its descendants, and where the form sends it. Null when the form is
 * not marked as a search and has neither an input[type=search] nor a text field named like a query.
 */
function searchFormOf(
  form: Element,
  baseUrl: string,
  pageUrl: string,
  walk: Walk,
): Pick<SearchFormElement, 'action' | 'method' | 'field' | 'marked'> | null {
  const marked = markedSearch(form)
  let field: string | null = null
  let typed = false
  const stack: Node[] = [...form.childNodes].reverse()
  while (stack.length > 0 && walk.left > 0) {
    const node = stack.pop()
    walk.left--
    if (node === undefined || !isElement(node)) continue
    if (node.tagName === 'input' && isHtmlElement(node, 'input')) {
      const type = inputType(attr(node, 'type'))
      const name = attr(node, 'name')?.trim()
      if (name !== undefined && name !== '' && (type === 'search' || type === 'text')) {
        if (type === 'search' && !typed) {
          field = name
          typed = true
        } else if (field === null && QUERY_NAMES.has(name.toLowerCase())) field = name
        else if (field === null && marked) field = name
      }
    }
    stack.push(...[...node.childNodes].reverse())
  }
  if (field === null || (!marked && !typed && !QUERY_NAMES.has(field.toLowerCase()))) return null
  const action = attr(form, 'action')
  return {
    action:
      action === null || action.trim() === '' ? pageUrl : (resolve(action, baseUrl) ?? pageUrl),
    method: attr(form, 'method')?.trim().toLowerCase() === 'post' ? 'post' : 'get',
    field,
    marked,
  }
}
/**
 * Text alternatives kept from one page (M2.3c review): the first this many and the last this many,
 * in document order, so a page's payment logos, which sit in its footer, are kept beside its first
 * images and labels, however many products come between. What lies between is not kept, which the
 * copy of the rule that reads them states.
 */
export const MAX_TEXT_ALTERNATIVES = 1_000

/** The last `size` items added, in the order they were added, kept in a ring. */
class LastKept<T> {
  readonly #size: number
  readonly #items: T[] = []
  #next = 0

  constructor(size: number) {
    this.#size = size
  }

  add(item: T): void {
    if (this.#items.length < this.#size) {
      this.#items.push(item)
      return
    }
    this.#items[this.#next] = item
    this.#next = (this.#next + 1) % this.#size
  }

  toArray(): T[] {
    return [...this.#items.slice(this.#next), ...this.#items.slice(0, this.#next)]
  }
}

/**
 * An element's names for those who cannot see it: an image's alt, an <svg>'s first <title>, and
 * an aria-label, each whitespace collapsed and never empty.
 */
function textAlternativesOf(element: Element): [TextAlternative['source'], string][] {
  const found: [TextAlternative['source'], string][] = []
  const add = (source: TextAlternative['source'], value: string | null) => {
    const text = value === null ? '' : truncate(collapseWhitespace(value))
    if (text !== '') found.push([source, text])
  }
  if (
    isHtmlElement(element, element.tagName) &&
    (element.tagName === 'img' ||
      element.tagName === 'area' ||
      (element.tagName === 'input' && inputType(attr(element, 'type')) === 'image'))
  ) {
    add('alt', attr(element, 'alt'))
  }
  if (element.tagName === 'svg' && element.namespaceURI === namespaces.NS.SVG) {
    const title = element.childNodes.find(
      (child): child is Element =>
        isElement(child) && child.tagName === 'title' && child.namespaceURI === namespaces.NS.SVG,
    )
    if (title !== undefined) add('svg-title', textOf(title, { left: WALK_BUDGET }))
  }
  add('aria-label', attr(element, 'aria-label'))
  return found
}
/** Candidates read from one srcset. */
export const MAX_SRCSET_CANDIDATES = 50

type LoadKind = InsecureLoadElement['kind']

/** Attributes that load a resource, by element, and how browsers treat them over http:. */
const LOADS: Readonly<Record<string, readonly (readonly [string, LoadKind])[]>> = {
  script: [['src', 'blockable']],
  iframe: [['src', 'blockable']],
  frame: [['src', 'blockable']],
  object: [['data', 'blockable']],
  embed: [['src', 'blockable']],
  img: [
    ['src', 'upgradable'],
    ['srcset', 'upgradable'],
  ],
  video: [
    ['src', 'upgradable'],
    ['poster', 'upgradable'],
  ],
  audio: [['src', 'upgradable']],
  track: [['src', 'blockable']],
  form: [['action', 'form']],
}

/** The http: loads of one element, each srcset candidate on its own. */
function insecureLoadsOf(
  element: Element,
  baseUrl: string,
  forms: ReadonlySet<string>,
): Omit<InsecureLoadElement, keyof ElementRef>[] {
  const loads: Omit<InsecureLoadElement, keyof ElementRef>[] = []
  const check = (attribute: string, kind: LoadKind, value: string) => {
    const url = resolve(value.trim(), baseUrl)
    if (url?.startsWith('http:') !== true) return
    // An image or media file on an IP address is not upgraded: it is blocked.
    const blocked = kind === 'upgradable' && isAddressUrl(url)
    loads.push({ tag: element.tagName, attribute, url, kind: blocked ? 'blockable' : kind })
  }
  const load = (attribute: string, kind: LoadKind) => {
    const value = attr(element, attribute)
    if (value === null || value.trim() === '') return
    if (attribute === 'srcset') for (const url of srcsetUrls(value)) check(attribute, kind, url)
    else check(attribute, kind, value)
  }
  const parent = parentTag(element)
  switch (element.tagName) {
    case 'link': {
      // Icons are not upgraded either (Mixed Content §4.1): both are blocked.
      const rel = tokens(attr(element, 'rel'))
      if (rel.includes('stylesheet') || rel.includes('icon')) load('href', 'blockable')
      return loads
    }
    case 'script':
      if (fetchesScript(element)) load('src', 'blockable')
      return loads
    case 'img':
      // An image set, chosen by srcset or <picture>, is blocked rather than upgraded.
      if (attr(element, 'srcset') !== null || parent === 'picture') {
        load('src', 'blockable')
        load('srcset', 'blockable')
        return loads
      }
      break
    case 'source':
      // A <picture> source is part of an image set; an audio or video source is media.
      if (parent === 'picture') load('srcset', 'blockable')
      else if (parent === 'video' || parent === 'audio') load('src', 'upgradable')
      return loads
    case 'input':
      if (inputType(attr(element, 'type')) === 'image') load('src', 'upgradable')
      if (submitsForm(element, forms)) load('formaction', 'form')
      return loads
    case 'button':
      if (submitsForm(element, forms)) load('formaction', 'form')
      return loads
  }
  for (const [attribute, kind] of LOADS[element.tagName] ?? []) load(attribute, kind)
  return loads
}

/**
 * The URLs of a srcset's candidates, as HTML's srcset parser splits them: a URL runs to
 * whitespace, so it may hold commas, and its descriptors run to a comma outside parentheses. At
 * most MAX_SRCSET_CANDIDATES.
 */
export function srcsetUrls(value: string): string[] {
  const urls: string[] = []
  const space = (character: string | undefined) =>
    character === ' ' ||
    character === '\t' ||
    character === '\n' ||
    character === '\f' ||
    character === '\r'
  let at = 0
  while (urls.length < MAX_SRCSET_CANDIDATES) {
    while (at < value.length && (space(value[at]) || value[at] === ',')) at++
    if (at >= value.length) break
    const start = at
    while (at < value.length && !space(value[at])) at++
    let url = value.slice(start, at)
    if (url.endsWith(',')) {
      // No descriptors: the commas end the candidate.
      url = url.replace(/,+$/, '')
    } else {
      let inParens = false
      for (; at < value.length; at++) {
        const character = value[at]
        if (inParens) inParens = character !== ')'
        else if (character === '(') inParens = true
        else if (character === ',') {
          at++
          break
        }
      }
    }
    if (url !== '') urls.push(url)
  }
  return urls
}

/** HTML's JavaScript MIME type essences: a script of any other type is not run, nor fetched. */
const JAVASCRIPT_TYPES: ReadonlySet<string> = new Set([
  'application/ecmascript',
  'application/javascript',
  'application/x-ecmascript',
  'application/x-javascript',
  'text/ecmascript',
  'text/javascript',
  'text/javascript1.0',
  'text/javascript1.1',
  'text/javascript1.2',
  'text/javascript1.3',
  'text/javascript1.4',
  'text/javascript1.5',
  'text/jscript',
  'text/livescript',
  'text/x-ecmascript',
  'text/x-javascript',
])

/**
 * Whether the browser fetches the script's src (HTML "prepare the script element"): a classic
 * script without nomodule, which browsers with modules skip, or a module. Data blocks, templates
 * and import maps are not fetched.
 */
function fetchesScript(element: Element): boolean {
  const type = attr(element, 'type')
  const language = attr(element, 'language')
  const typeString =
    type !== null ? type.trim() : language !== null && language !== '' ? `text/${language}` : ''
  const lowered = typeString.toLowerCase()
  if (lowered === 'module') return true
  const classic = lowered === '' || JAVASCRIPT_TYPES.has(lowered)
  return classic && attr(element, 'nomodule') === null
}

/**
 * Whether the button or input submits a form: a submit button (a <button> of type submit, the
 * default, or an <input> of type submit or image) with a form owner, which formaction then
 * sends to. The owner is the form its form attribute names, else the form it is in.
 */
function submitsForm(element: Element, forms: ReadonlySet<string>): boolean {
  if (element.tagName === 'button') {
    const type = attr(element, 'type')?.trim().toLowerCase()
    if (type === 'reset' || type === 'button') return false
  } else {
    const type = inputType(attr(element, 'type'))
    if (type !== 'submit' && type !== 'image') return false
  }
  const owner = attr(element, 'form')
  if (owner !== null) return forms.has(owner)
  // Not the type guard, which would leave `node` as never past a failed check.
  const isForm = (node: Element): boolean => isHtmlElement(node, 'form')
  for (let node = element.parentNode; node !== null && isElement(node); node = node.parentNode) {
    if (isForm(node)) return true
  }
  return false
}

/** The IDs whose first element is a form: those a form attribute can name. */
function formIds(all: readonly Element[]): Set<string> {
  const first = new Map<string, Element>()
  for (const element of all) {
    const id = attr(element, 'id')
    if (id !== null && id !== '' && !first.has(id)) first.set(id, element)
  }
  const forms = new Set<string>()
  for (const [id, element] of first) if (isHtmlElement(element, 'form')) forms.add(id)
  return forms
}

/** The parent element's tag name; null at the top or under a non-HTML parent. */
function parentTag(element: Element): string | null {
  const parent = element.parentNode
  return parent !== null && isElement(parent) && isHtmlElement(parent, parent.tagName)
    ? parent.tagName
    : null
}

/** Whether the URL's host is an IP address, which the URL parser has written in its usual form. */
function isAddressUrl(url: string): boolean {
  const { hostname } = new URL(url)
  return hostname.startsWith('[') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
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
