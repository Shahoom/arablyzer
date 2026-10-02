import {
  defaultTreeAdapter,
  parse,
  type DefaultTreeAdapterMap,
  type DefaultTreeAdapterTypes,
  type TreeAdapter,
} from 'parse5'
import { DocumentIndex, type Document } from './dom'
import { decodeHtml } from './encoding'
import { collectHtml, type HtmlFacts } from './html'
import { parseLinkHeader, type LinkHeaderEntry } from './link-header'
import { collectText, type TextFacts } from './text'

export type Header = readonly [name: string, value: string]

/** A fetched page, independent of how it was fetched. */
export interface PageInput {
  /** The final URL, after redirects. */
  readonly url: string
  readonly status: number
  /** Names lowercased; repeated headers kept in order. */
  readonly headers: readonly Header[]
  readonly body: Uint8Array
  readonly certificate?: CertificateFacts | null
}

/** The TLS certificate the page came with, and when it was checked. */
export interface CertificateFacts {
  /** ISO 8601. */
  readonly validFrom: string
  readonly validTo: string
  /**
   * When the page was fetched: rules measure the time left from here, so a report reads the same
   * whenever it is read.
   */
  readonly checkedAt: string
}

/** Everything the rules may read about the page itself (BUILD-PLAN §10 `PageFacts`). */
export interface PageFacts {
  readonly url: string
  readonly status: number
  readonly headers: readonly Header[]
  readonly contentType: string | null
  /** MIME type essence, lowercased; null without a Content-Type. */
  readonly mimeType: string | null
  readonly isHtml: boolean
  readonly linkHeaders: readonly LinkHeaderEntry[]
  /** null over plain HTTP, or when the certificate's dates could not be read. */
  readonly certificate: CertificateFacts | null
  /** null unless the response is HTML (and was parsed before the deadline). */
  readonly html: HtmlFacts | null
  readonly text: TextFacts | null
  /** Only the first HTML_PARSE_LIMIT bytes were parsed. */
  readonly htmlTruncated: boolean
  /**
   * The page is too complex to read: parsing ran out of time, or the page holds more nodes
   * (MAX_HTML_NODES) or nests deeper (MAX_HTML_DEPTH) than a tree may. html and text are null.
   */
  readonly htmlTooComplex: boolean
}

export interface CollectOptions {
  /** performance.now() time by which HTML parsing must finish. */
  readonly deadline?: number
  /** Bytes of HTML to parse; the rest is ignored. Default HTML_PARSE_LIMIT. */
  readonly maxHtmlBytes?: number
  /** Nodes the heading and label walks may visit in all. Default WALK_BUDGET. */
  readonly walkBudget?: number
  /** Elements and comments the tree may hold; past them the page is too complex. Default MAX_HTML_NODES. */
  readonly maxNodes?: number
  /** Levels of nesting the tree may reach; past them the page is too complex. Default MAX_HTML_DEPTH. */
  readonly maxDepth?: number
}

/**
 * Googlebot reads the first 15 MB of an HTML file and ignores the rest, so Arablyzer parses no
 * more either; it also bounds parse5's memory, which grows to many times the input.
 */
export const HTML_PARSE_LIMIT = 15 * 1024 * 1024

/**
 * Elements and comments a page's tree may hold (H1 of the pre-launch review). The bytes are capped
 * at 15 MB, but a byte is worth many bytes of heap: 1.4 million `<p>` are 4 KB gzipped and took
 * more heap than the scanner's container has, and 2 million comments (14 MB) hold 400 MB. Real
 * pages have thousands of elements: Lighthouse calls 1,400 too many. Not a clock, so the same page
 * is too complex on every machine. Text nodes are not counted: they sit between the others.
 */
export const MAX_HTML_NODES = 200_000

/**
 * Levels of nesting a page's tree may reach. parse5 works through the open elements with many
 * start tags, so nesting costs time quadratic in its depth. Measured on Node 22.22, Apple silicon:
 * 5,000 nested `<div>` take 0.10 s, 20,000 take 1.3 s, 50,000 take 8.3 s and 100,000 take 31 s.
 * Chromium's own parser stops nesting at 512 (kMaximumHTMLParserDOMTreeDepth), so no page needs
 * the many thousands this allows: the room is for pages that are broken, not for pages that work.
 */
export const MAX_HTML_DEPTH = 10_000

export function headerValues(headers: readonly Header[], name: string): string[] {
  return headers.filter(([key]) => key === name).map(([, value]) => value)
}

/** What a page's headers and body say before its HTML is read. */
export interface PageHead {
  readonly base: Omit<PageFacts, 'html' | 'text' | 'htmlTruncated' | 'htmlTooComplex'>
  /** application/xhtml+xml: there, xml:lang declares the language too. */
  readonly xhtml: boolean
}

/** What the HTML of a page gives, when it could be read. */
export interface HtmlRead {
  readonly html: HtmlFacts
  readonly text: TextFacts
}

/** What reading a page's HTML needs, as plain data: it may go to another thread (isolated.ts). */
export interface HtmlJob {
  readonly url: string
  readonly body: Uint8Array
  readonly contentType: string | null
  readonly xhtml: boolean
}

export function pageHead(input: PageInput): PageHead {
  const contentType =
    headerValues(input.headers, 'content-type').findLast((value) => value.trim() !== '') ?? null
  const mimeType = contentType === null ? null : essence(contentType)
  const isHtml =
    mimeType === null
      ? looksLikeHtml(input.body)
      : mimeType === 'text/html' || mimeType === 'application/xhtml+xml'
  const linkHeaders = headerValues(input.headers, 'link').flatMap((value) =>
    parseLinkHeader(value, input.url),
  )
  return {
    base: {
      url: input.url,
      status: input.status,
      headers: input.headers,
      contentType,
      mimeType,
      isHtml,
      linkHeaders,
      certificate: input.certificate ?? null,
    },
    xhtml: mimeType === 'application/xhtml+xml',
  }
}

/** The facts of a page whose HTML was read, or was too complex to (read is null). */
export function pageFacts(
  head: PageHead,
  htmlTruncated: boolean,
  read: HtmlRead | null,
): PageFacts {
  return read === null
    ? { ...head.base, html: null, text: null, htmlTruncated, htmlTooComplex: true }
    : { ...head.base, ...read, htmlTruncated, htmlTooComplex: false }
}

/** Whether the page's HTML is longer than what is read of it. */
export function isTruncated(input: PageInput, options: CollectOptions): boolean {
  return input.body.length > (options.maxHtmlBytes ?? HTML_PARSE_LIMIT)
}

/** The facts of a page that is not HTML: there is nothing to read of it but its headers. */
export function pageFactsWithoutHtml(head: PageHead): PageFacts {
  return { ...head.base, html: null, text: null, htmlTruncated: false, htmlTooComplex: false }
}

/** What reading the HTML of a page takes, of the page. */
export function htmlJobOf(input: PageInput, head: PageHead): HtmlJob {
  return {
    url: input.url,
    body: input.body,
    contentType: head.base.contentType,
    xhtml: head.xhtml,
  }
}

export function collectPage(input: PageInput, options: CollectOptions = {}): PageFacts {
  const head = pageHead(input)
  if (!head.base.isHtml) return pageFactsWithoutHtml(head)
  return pageFacts(head, isTruncated(input, options), readHtml(htmlJobOf(input, head), options))
}

/**
 * Reads a page's HTML into facts. Null when the page is too complex: it ran past the deadline, or
 * holds more nodes, or nests deeper, than a tree may (MAX_HTML_NODES, MAX_HTML_DEPTH).
 */
export function readHtml(job: HtmlJob, options: CollectOptions = {}): HtmlRead | null {
  const limit = options.maxHtmlBytes ?? HTML_PARSE_LIMIT
  const { text: source, encoding } = decodeHtml(
    job.body.length > limit ? job.body.subarray(0, limit) : job.body,
    job.contentType,
  )
  let document: Document
  try {
    document = parse(source, {
      sourceCodeLocationInfo: true,
      treeAdapter: boundedTreeAdapter({
        deadline: options.deadline ?? Number.POSITIVE_INFINITY,
        maxNodes: options.maxNodes ?? MAX_HTML_NODES,
        maxDepth: options.maxDepth ?? MAX_HTML_DEPTH,
      }),
    })
  } catch (error) {
    if (!(error instanceof ParseLimit)) throw error
    return null
  }
  const index = new DocumentIndex(document, source)
  return {
    html: collectHtml(index, job.url, encoding, {
      xhtml: job.xhtml,
      ...(options.walkBudget === undefined ? {} : { walkBudget: options.walkBudget }),
    }),
    text: collectText(index),
  }
}

/** The parse was given up: out of time, or the page is too big to hold as a tree. */
class ParseLimit extends Error {}

interface TreeLimits {
  readonly deadline: number
  readonly maxNodes: number
  readonly maxDepth: number
}

type Node = DefaultTreeAdapterTypes.Node
type ParentNode = DefaultTreeAdapterTypes.ParentNode

/**
 * parse5's default tree, bounded three ways, each by an error that ends the parse (H1 of the
 * pre-launch review). A clock check on every element and text insertion: parse5 can be quadratic
 * in nesting depth, so a hostile page is cut off at the deadline instead of stalling the scan. A
 * count of the elements and comments made, and the depth of each element placed: a hostile page
 * cannot fill the heap with a tree, or nest so deep that no deadline could end its parse in time.
 * The count and the depth are the page's own, so they do not depend on the machine.
 */
function boundedTreeAdapter(limits: TreeLimits): TreeAdapter<DefaultTreeAdapterMap> {
  const { deadline, maxNodes, maxDepth } = limits
  const check = () => {
    if (performance.now() > deadline) throw new ParseLimit('HTML parsing ran out of time')
  }
  let nodes = 0
  const count = () => {
    if (++nodes > maxNodes)
      throw new ParseLimit(`The page holds more than ${String(maxNodes)} nodes`)
  }
  /**
   * The level of each parent so far: the document is 0, <html> 1. A template's content, which is
   * no element, sits at the level of its template, so nesting templates is nesting.
   */
  const levels = new Map<ParentNode, number>()
  const place = (parent: ParentNode, child: Node) => {
    if (!('tagName' in child)) return
    const level = (levels.get(parent) ?? 0) + 1
    if (level > maxDepth)
      throw new ParseLimit(`The page nests deeper than ${String(maxDepth)} levels`)
    levels.set(child, level)
    if ('content' in child) levels.set(child.content, level)
  }
  return {
    ...defaultTreeAdapter,
    createElement: (tagName, namespaceURI, attrs) => {
      check()
      count()
      return defaultTreeAdapter.createElement(tagName, namespaceURI, attrs)
    },
    createCommentNode: (data) => {
      count()
      return defaultTreeAdapter.createCommentNode(data)
    },
    insertText: (parentNode, text) => {
      check()
      defaultTreeAdapter.insertText(parentNode, text)
    },
    appendChild: (parentNode, newNode) => {
      place(parentNode, newNode)
      defaultTreeAdapter.appendChild(parentNode, newNode)
    },
    insertBefore: (parentNode, newNode, referenceNode) => {
      place(parentNode, newNode)
      defaultTreeAdapter.insertBefore(parentNode, newNode, referenceNode)
    },
  }
}

function essence(contentType: string): string | null {
  const value = (contentType.split(';')[0] ?? '').trim().toLowerCase()
  return value === '' ? null : value
}

/** WHATWG MIME Sniffing: the HTML signatures of "identifying an unknown MIME type". */
const HTML_SIGNATURES = [
  '<!doctype html',
  '<html',
  '<head',
  '<script',
  '<iframe',
  '<h1',
  '<div',
  '<font',
  '<table',
  '<a',
  '<style',
  '<title',
  '<b',
  '<body',
  '<br',
  '<p',
  '<!--',
]

function looksLikeHtml(body: Uint8Array): boolean {
  let start = 0
  if (body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf) start = 3
  while (start < body.length && [0x09, 0x0a, 0x0c, 0x0d, 0x20].includes(body[start] ?? 0)) start++
  const head = new TextDecoder('windows-1252')
    .decode(body.subarray(start, start + 16))
    .toLowerCase()
  // Each signature must be followed by a space or '>' (the spec's "tag-terminating byte").
  return HTML_SIGNATURES.some(
    (signature) =>
      head.startsWith(signature) && ' >'.includes(head.charAt(signature.length) || '_'),
  )
}
