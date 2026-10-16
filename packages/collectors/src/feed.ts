import sax, { type Tag } from 'sax'
import { SITEMAP_MAX_ATTRIBUTES, SITEMAP_MAX_DEPTH } from './sitemap'

/**
 * A product feed as Google Merchant Center reads it: an RSS 2.0 or Atom 1.0 file with the Google
 * namespace (`g:`), or a tab-delimited text file whose first row names the columns. The reader
 * keeps what the rules about a feed need and nothing is fetched beyond the file itself (M6.1).
 */
export type FeedFormat = 'rss' | 'atom' | 'tsv'

/** The namespace of the `g:` attributes (Merchant Center's product data specification). */
export const GOOGLE_NAMESPACE = 'http://base.google.com/ns/1.0'

/** Items kept; the reading stops at the next one, so the cost of a huge file stays bounded. */
export const MAX_FEED_ITEMS = 5000

/** Characters of one attribute's value that are kept (a description is 5,000 at most). */
export const MAX_FEED_VALUE = 5100

/** One product: its attributes by Google's names, `g:` and spaces folded (`image_link`). */
export interface FeedItem {
  /** Where the item starts in the file, from 1. */
  readonly line: number
  /** The first value of each attribute; an attribute with nested values is there with ''. */
  readonly attributes: ReadonlyMap<string, string>
}

/** Why a response is no feed the reader can use. */
export type FeedUnreadable =
  | 'html'
  | 'empty'
  | 'compressed'
  | 'not-utf8'
  | 'not-xml'
  | 'not-a-feed'
  | 'no-items'
  | 'no-columns'

export type FeedFacts =
  | {
      readonly kind: 'feed'
      readonly format: FeedFormat
      /** The first MAX_FEED_ITEMS items. */
      readonly items: readonly FeedItem[]
      /** The file has more items than were read. */
      readonly more: boolean
    }
  | {
      readonly kind: 'unreadable'
      readonly reason: FeedUnreadable
      /** For `not-xml`: where the XML breaks, from 1. */
      readonly line?: number
      readonly column?: number
      /** For `not-a-feed`: the root element's name. */
      readonly root?: string
    }

export interface FeedInput {
  readonly body: Uint8Array
}

/** A `.gz` file served as it is. */
function isGzip(body: Uint8Array): boolean {
  return body[0] === 0x1f && body[1] === 0x8b
}

/** `Image Link`, `g:image_link` and `image link` are one attribute. */
export function attributeName(name: string): string {
  return name
    .trim()
    .replace(/^g:/i, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

export function collectFeed(input: FeedInput): FeedFacts {
  const { body } = input
  if (isGzip(body)) return { kind: 'unreadable', reason: 'compressed' }
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    return { kind: 'unreadable', reason: 'not-utf8' }
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const start = text.search(/[^\t\n\r ]/)
  if (start === -1) return { kind: 'unreadable', reason: 'empty' }
  const head = text.slice(start, start + 40).toLowerCase()
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) {
    return { kind: 'unreadable', reason: 'html' }
  }
  if (text.charAt(start) === '<') return readXml(text)
  if (text.charAt(start) === '{' || text.charAt(start) === '[') {
    return { kind: 'unreadable', reason: 'not-a-feed' }
  }
  return readTsv(text)
}

/** Thrown from sax's handlers to end the reading: at an XML error, a limit, or the last item. */
class Stop extends Error {
  readonly line: number
  readonly column: number
  /** The reading ended where it meant to (the last item, or a root that is no feed's). */
  readonly done: boolean

  constructor(line: number, column: number, done = false) {
    super('stop')
    this.line = line
    this.column = column
    this.done = done
  }
}

const CHUNK_LENGTH = 64 * 1024

function readXml(text: string): FeedFacts {
  const parser = sax.parser(true, { xmlns: false, position: true, strictEntities: true })
  const googlePrefixes = new Set(['g'])
  const stack: string[] = []
  // Set from sax's handlers, which the compiler does not follow.
  let format = null as FeedFormat | null
  let root = ''
  const items: FeedItem[] = []
  let more = false
  let attributes = 0
  let current: Map<string, string> | null = null
  let itemLine = 0
  // The child of the item being read, and its text so far; deeper elements add no text.
  let leaf: { name: string; text: string } | null = null

  const stop = (done = false) => new Stop(parser.line, parser.column, done)
  const itemDepth = () => (format === 'rss' ? 3 : 2)
  const isItem = (name: string) =>
    (format === 'rss' && name === 'item' && stack.length === 3 && stack[1] === 'channel') ||
    (format === 'atom' && name === 'entry' && stack.length === 2)

  parser.onopentagstart = () => {
    attributes = 0
  }
  parser.onattribute = () => {
    if (++attributes > SITEMAP_MAX_ATTRIBUTES) throw stop()
  }
  parser.onopentag = (tag: Tag) => {
    if (stack.length >= SITEMAP_MAX_DEPTH) throw stop()
    if (stack.length === 0) {
      root = tag.name
      if (tag.name === 'rss') format = 'rss'
      else if (tag.name === 'feed') format = 'atom'
      for (const name in tag.attributes) {
        if (name.startsWith('xmlns:') && tag.attributes[name] === GOOGLE_NAMESPACE) {
          googlePrefixes.add(name.slice(6))
        }
      }
    } else if (stack.length === 1 && format === null) {
      // The root is no feed's: nothing more to read.
      throw stop(true)
    }
    stack.push(tag.name)
    if (format !== null && isItem(tag.name)) {
      if (items.length >= MAX_FEED_ITEMS) {
        more = true
        throw stop(true)
      }
      current = new Map()
      itemLine = parser.line + 1
      leaf = null
      return
    }
    if (current !== null) {
      if (stack.length === itemDepth() + 1) {
        const prefix = tag.name.includes(':') ? tag.name.slice(0, tag.name.indexOf(':')) : ''
        const local = tag.name.slice(prefix === '' ? 0 : prefix.length + 1)
        const name = prefix === '' || googlePrefixes.has(prefix) ? attributeName(local) : null
        if (name !== null) {
          leaf = { name, text: '' }
          // Atom links carry their address in href.
          if (format === 'atom' && name === 'link') {
            const rel = tag.attributes.rel ?? 'alternate'
            if (rel === 'alternate' && tag.attributes.href !== undefined) {
              current.set('link', tag.attributes.href.slice(0, MAX_FEED_VALUE))
            }
            leaf = null
          }
        }
      } else if (leaf !== null && !current.has(leaf.name)) {
        // A nested value (shipping > price): the attribute is there, its text is not read.
        current.set(leaf.name, '')
        leaf = null
      }
    }
  }
  const addText = (value: string) => {
    if (leaf !== null && stack.length === itemDepth() + 1 && leaf.text.length < MAX_FEED_VALUE) {
      leaf.text = (leaf.text + value).slice(0, MAX_FEED_VALUE)
    }
  }
  parser.ontext = addText
  parser.oncdata = addText
  parser.onclosetag = () => {
    const name = stack.pop()
    if (current === null) return
    if (stack.length === itemDepth()) {
      if (leaf !== null) {
        const value = leaf.text.trim()
        let key = leaf.name
        // Atom's summary is the description.
        if (format === 'atom' && (key === 'summary' || key === 'content')) key = 'description'
        if (!current.has(key) || current.get(key) === '') current.set(key, value)
        leaf = null
      }
    } else if (stack.length === itemDepth() - 1 && name !== undefined) {
      items.push({ line: itemLine, attributes: current })
      current = null
    }
  }
  parser.onerror = () => {
    throw stop()
  }
  let stopped: Stop | null = null
  try {
    for (let offset = 0; offset < text.length;) {
      let end = Math.min(offset + CHUNK_LENGTH, text.length)
      const code = text.charCodeAt(end - 1)
      if (end < text.length && code >= 0xd800 && code <= 0xdbff) end++
      parser.write(text.slice(offset, end))
      offset = end
    }
    parser.close()
  } catch (error) {
    stopped = error instanceof Stop ? error : stop()
  }
  if (root.toLowerCase() === 'html') return { kind: 'unreadable', reason: 'html' }
  if (stopped !== null && !stopped.done) {
    return {
      kind: 'unreadable',
      reason: 'not-xml',
      line: stopped.line + 1,
      column: stopped.column + 1,
    }
  }
  if (root === '') {
    return {
      kind: 'unreadable',
      reason: 'not-xml',
      line: parser.line + 1,
      column: parser.column + 1,
    }
  }
  if (format === null) return { kind: 'unreadable', reason: 'not-a-feed', root }
  if (items.length === 0) return { kind: 'unreadable', reason: 'no-items' }
  return { kind: 'feed', format, items, more }
}

/** The columns a product feed's first row must have at least one of. */
const KNOWN_COLUMNS = new Set(['id', 'title', 'link', 'price', 'description'])

function readTsv(text: string): FeedFacts {
  const lines = text.split(/\r\n|\n|\r/)
  let first = 0
  while (first < lines.length && (lines[first] ?? '').trim() === '') first++
  const header = (lines[first] ?? '').split('\t').map((cell) => attributeName(unquote(cell)))
  if (header.length < 2 || !header.some((column) => KNOWN_COLUMNS.has(column))) {
    return { kind: 'unreadable', reason: 'no-columns' }
  }
  const items: FeedItem[] = []
  let more = false
  for (let index = first + 1; index < lines.length; index++) {
    const line = lines[index] ?? ''
    if (line.trim() === '') continue
    if (items.length >= MAX_FEED_ITEMS) {
      more = true
      break
    }
    const attributes = new Map<string, string>()
    line.split('\t').forEach((cell, column) => {
      const name = header[column]
      if (name === undefined || name === '' || attributes.has(name)) return
      attributes.set(name, unquote(cell).slice(0, MAX_FEED_VALUE))
    })
    items.push({ line: index + 1, attributes })
  }
  if (items.length === 0) return { kind: 'unreadable', reason: 'no-items' }
  return { kind: 'feed', format: 'tsv', items, more }
}

function unquote(cell: string): string {
  const value = cell.trim()
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1).replaceAll('""', '"')
    : value
}
