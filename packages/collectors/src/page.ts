import { defaultTreeAdapter, parse, type DefaultTreeAdapterMap, type TreeAdapter } from 'parse5'
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
  /** null unless the response is HTML (and was parsed before the deadline). */
  readonly html: HtmlFacts | null
  readonly text: TextFacts | null
  /** Only the first HTML_PARSE_LIMIT bytes were parsed. */
  readonly htmlTruncated: boolean
  /** Parsing stopped at the deadline, so html and text are null. */
  readonly htmlTimedOut: boolean
}

export interface CollectOptions {
  /** performance.now() time by which HTML parsing must finish. */
  readonly deadline?: number
  /** Bytes of HTML to parse; the rest is ignored. Default HTML_PARSE_LIMIT. */
  readonly maxHtmlBytes?: number
  /** Nodes the heading and label walks may visit in all. Default WALK_BUDGET. */
  readonly walkBudget?: number
}

/**
 * Googlebot reads the first 15 MB of an HTML file and ignores the rest, so Arablyzer parses no
 * more either; it also bounds parse5's memory, which grows to many times the input.
 */
export const HTML_PARSE_LIMIT = 15 * 1024 * 1024

export function headerValues(headers: readonly Header[], name: string): string[] {
  return headers.filter(([key]) => key === name).map(([, value]) => value)
}

export function collectPage(input: PageInput, options: CollectOptions = {}): PageFacts {
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
  const base = {
    url: input.url,
    status: input.status,
    headers: input.headers,
    contentType,
    mimeType,
    isHtml,
    linkHeaders,
  }
  if (!isHtml) return { ...base, html: null, text: null, htmlTruncated: false, htmlTimedOut: false }

  const limit = options.maxHtmlBytes ?? HTML_PARSE_LIMIT
  const htmlTruncated = input.body.length > limit
  const { text: source, encoding } = decodeHtml(
    htmlTruncated ? input.body.subarray(0, limit) : input.body,
    contentType,
  )
  const deadline = options.deadline ?? Number.POSITIVE_INFINITY
  let document: Document
  try {
    document = parse(source, {
      sourceCodeLocationInfo: true,
      treeAdapter: timedTreeAdapter(deadline),
    })
  } catch (error) {
    if (!(error instanceof ParseTimeout)) throw error
    return { ...base, html: null, text: null, htmlTruncated, htmlTimedOut: true }
  }
  const index = new DocumentIndex(document, source)
  return {
    ...base,
    html: collectHtml(index, input.url, encoding, {
      xhtml: mimeType === 'application/xhtml+xml',
      ...(options.walkBudget === undefined ? {} : { walkBudget: options.walkBudget }),
    }),
    text: collectText(index),
    htmlTruncated,
    htmlTimedOut: false,
  }
}

class ParseTimeout extends Error {}

/**
 * parse5's default tree, with a clock check on every element and text insertion: parse5 can be
 * quadratic in nesting depth, so a hostile page is cut off at the deadline instead of stalling
 * the scan.
 */
function timedTreeAdapter(deadline: number): TreeAdapter<DefaultTreeAdapterMap> {
  if (deadline === Number.POSITIVE_INFINITY) return defaultTreeAdapter
  const check = () => {
    if (performance.now() > deadline) throw new ParseTimeout('HTML parsing ran out of time')
  }
  return {
    ...defaultTreeAdapter,
    createElement: (tagName, namespaceURI, attrs) => {
      check()
      return defaultTreeAdapter.createElement(tagName, namespaceURI, attrs)
    },
    insertText: (parentNode, text) => {
      check()
      defaultTreeAdapter.insertText(parentNode, text)
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
