import { parse } from 'parse5'
import { DocumentIndex } from './dom'
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
  /** null unless the response is HTML. */
  readonly html: HtmlFacts | null
  readonly text: TextFacts | null
}

export function headerValues(headers: readonly Header[], name: string): string[] {
  return headers.filter(([key]) => key === name).map(([, value]) => value)
}

export function collectPage(input: PageInput): PageFacts {
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
  if (!isHtml) return { ...base, html: null, text: null }

  const { text: source, encoding } = decodeHtml(input.body, contentType)
  const document = parse(source, { sourceCodeLocationInfo: true })
  const index = new DocumentIndex(document, source)
  return { ...base, html: collectHtml(index, input.url, encoding), text: collectText(index) }
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
