import { renderInline, renderMarkdown } from './markdown'

// A blog article's Markdown (apps/web/src/content/blog): our strict subset (markdown.ts) plus two
// levels of headings, each with an id written out by the author, so that a link to a section
// survives a change of its title, and the page's contents list is exactly these ids.
//
//   Text before the first heading is the introduction.
//   ## A section's title {#section-id}
//   ### A smaller heading {#smaller-id}

export interface ArticleSection {
  readonly id: string
  readonly title: string
  /** The section's HTML, without its own h2; its h3s are in it. */
  readonly html: string
}

export interface RenderedArticle {
  /** The text before the first heading: the lead of the article's body. */
  readonly intro: string
  readonly sections: readonly ArticleSection[]
  /** Words of the body without code blocks: the reading time and `wordCount` read it. */
  readonly words: number
}

const HEADING = /^(#{2,3}) (.+?) \{#([a-z][a-z0-9-]*)\}\s*$/
const BARE_HEADING = /^ {0,3}#{1,6}(?:\s|$)/
const FENCE = /^ {0,3}(`{3,}|~{3,})/

/** Words an adult reads a minute: the one figure both languages use, so a time is an estimate. */
export const WORDS_PER_MINUTE = 200

export function readingMinutes(words: number): number {
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))
}

/** Words of Markdown prose: code blocks and the marks of the syntax are not words. */
export function countWords(markdown: string): number {
  let inCode = false
  let words = 0
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (FENCE.test(line)) {
      inCode = !inCode
      continue
    }
    if (inCode) continue
    const text = line
      .replace(/^#{1,6}\s+/, '')
      .replace(/\{#[a-z0-9-]+\}/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[`*|]/g, ' ')
      .replace(/^[-\d.]+\s/, '')
    words += text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length
  }
  return words
}

export function renderArticle(body: string): RenderedArticle {
  const lines = body.replace(/\r\n?/g, '\n').split('\n')
  const ids = new Set<string>()
  const sections: { id: string; title: string; chunks: string[] }[] = []
  const intro: string[] = []
  let chunk: string[] = []
  let current: (typeof sections)[number] | undefined
  let inCode = false

  const flush = () => {
    const markdown = chunk.join('\n')
    chunk = []
    if (markdown.trim() === '') return
    const html = renderMarkdown(markdown)
    if (current === undefined) intro.push(html)
    else current.chunks.push(html)
  }

  for (const line of lines) {
    if (FENCE.test(line)) inCode = !inCode
    if (!inCode) {
      const heading = HEADING.exec(line)
      if (heading !== null) {
        const [, marks, title, id] = heading as unknown as [string, string, string, string]
        if (ids.has(id)) throw new Error(`Two headings have the id ${id}`)
        ids.add(id)
        flush()
        if (marks === '##') {
          current = { id, title, chunks: [] }
          sections.push(current)
        } else {
          if (current === undefined) throw new Error(`A ### needs a ## before it: ${line}`)
          current.chunks.push(`<h3 id="${id}">${renderInline(title)}</h3>`)
        }
        continue
      }
      if (BARE_HEADING.test(line)) {
        throw new Error(`A heading is "## Title {#id}" or "### Title {#id}", with an id: ${line}`)
      }
    }
    chunk.push(line)
  }
  if (inCode) throw new Error('A code block is not closed')
  flush()
  return {
    intro: intro.join('\n'),
    sections: sections.map((section) => ({
      id: section.id,
      title: section.title,
      html: section.chunks.join('\n'),
    })),
    words: countWords(body),
  }
}

/** A heading's title as text for a contents list and for JSON-LD. */
export function titleText(title: string): string {
  return title.replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1')
}

export type Frontmatter = Readonly<Record<string, string | boolean | readonly string[]>>

/**
 * The frontmatter of an article file and its body. Only the YAML the articles use: `key: value`
 * lines whose value is a "double-quoted" or 'single-quoted' string, a bare word, true or false, or
 * a one-line [list, of, strings]. Astro reads the real YAML when it builds; this is for the checks
 * that read the files without Astro.
 */
export function parseFrontmatter(raw: string): { data: Frontmatter; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw.replace(/\r\n?/g, '\n'))
  if (match === null) throw new Error('A file starts with a --- frontmatter --- block')
  const data: Record<string, string | boolean | readonly string[]> = {}
  for (const line of (match[1] ?? '').split('\n')) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    const pair = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line)
    if (pair === null) throw new Error(`Not a "key: value" line: ${line}`)
    data[pair[1] ?? ''] = scalar((pair[2] ?? '').trim())
  }
  return { data, body: match[2] ?? '' }
}

function scalar(value: string): string | boolean | readonly string[] {
  if (value === 'true') return true
  if (value === 'false') return false
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()
    if (inner === '') return []
    return splitList(inner).map((item) => unquote(item.trim()))
  }
  return unquote(value)
}

function splitList(inner: string): string[] {
  const items: string[] = []
  let quote = ''
  let start = 0
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i] ?? ''
    if (quote !== '') {
      if (char === quote) quote = ''
    } else if (char === '"' || char === "'") quote = char
    else if (char === ',') {
      items.push(inner.slice(start, i))
      start = i + 1
    }
  }
  items.push(inner.slice(start))
  return items
}

function unquote(value: string): string {
  const quoted = /^(["'])([\s\S]*)\1$/.exec(value)
  return quoted === null ? value : (quoted[2] ?? '')
}
