import { escapeHtml } from './html'

/**
 * A strict Markdown subset for our own copy: paragraphs, "-" and "1." lists, fenced code blocks,
 * pipe tables, one-paragraph block quotes ("> a sentence", the article's pull-quote), inline code,
 * **bold**, links to https: or to our own paths, and backslash escapes.
 * Anything else is either a build error or text, escaped, so copy can never inject markup and a
 * construct we do not support never renders wrongly without a word.
 */
export function renderMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const blocks: string[] = []
  let i = 0
  const line = () => lines[i] ?? ''
  while (i < lines.length) {
    const current = line()
    if (current.trim() === '') {
      i++
      continue
    }
    const fence = FENCE.exec(current)
    if (fence !== null) {
      const mark = fence[1] ?? '```'
      const info = (fence[2] ?? '').trim()
      const code: string[] = []
      i++
      // CommonMark: the closing fence is at least as long as the opening one, with no info string.
      const closes = (text: string) => text.trim().startsWith(mark) && /^(`+|~+)$/.test(text.trim())
      while (i < lines.length && !closes(line())) code.push(lines[i++] ?? '')
      if (i >= lines.length) throw new Error(`A code block is not closed: ${current}`)
      i++
      const language = info === '' ? '' : ` class="language-${info.replace(/[^a-z0-9-]/gi, '-')}"`
      blocks.push(`<pre dir="ltr"><code${language}>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }
    if (QUOTE.test(current)) {
      const quote: string[] = []
      while (i < lines.length && QUOTE.test(line())) {
        quote.push((QUOTE.exec(line())?.[1] ?? '').trim())
        i++
      }
      if (quote.some((text) => text === '')) {
        throw new Error('A block quote is one paragraph: no empty lines inside it')
      }
      blocks.push(`<blockquote><p>${renderInline(quote.join(' '))}</p></blockquote>`)
      continue
    }
    unsupported(current)
    if (TABLE_ROW.test(current)) {
      blocks.push(table())
      continue
    }
    if (LIST.test(current)) {
      blocks.push(list())
      continue
    }
    const paragraph: string[] = []
    while (i < lines.length && line().trim() !== '' && !startsBlock(line())) {
      unsupported(line())
      paragraph.push(line().trim())
      i++
    }
    blocks.push(`<p>${renderInline(paragraph.join(' '))}</p>`)
  }
  return blocks.join('\n')

  function table(): string {
    const header = cells(line())
    i++
    if (!TABLE_SEPARATOR.test(line())) {
      throw new Error(`A table needs a separator row: ${lines[i - 1] ?? ''}`)
    }
    const separator = cells(line()).length
    if (separator !== header.length) {
      throw new Error(`A table separator has ${separator} cells, not ${header.length}: ${line()}`)
    }
    i++
    const rows: string[][] = []
    while (i < lines.length && TABLE_ROW.test(line())) {
      const row = cells(line())
      if (row.length !== header.length) {
        throw new Error(`A table row has ${row.length} cells, not ${header.length}: ${line()}`)
      }
      rows.push(row)
      i++
    }
    const tr = (row: readonly string[], tag: 'th' | 'td') =>
      `<tr>${row.map((cell) => `<${tag}>${renderInline(cell)}</${tag}>`).join('')}</tr>`
    return `<table><thead>${tr(header, 'th')}</thead><tbody>${rows.map((row) => tr(row, 'td')).join('')}</tbody></table>`
  }

  function list(): string {
    const ordered = /^\d/.test(line())
    const items: string[] = []
    while (i < lines.length) {
      const text = line()
      const item = LIST.exec(text)
      if (item !== null && /^\d/.test(text) === ordered) {
        if (ordered && Number.parseInt(item[1] ?? '', 10) !== items.length + 1) {
          throw new Error(`Numbered lists count from 1, one by one: ${text}`)
        }
        items.push(item[2] ?? '')
      } else if (items.length > 0 && /^ {2,}\S/.test(text)) {
        const inner = text.trim()
        if (LIST.test(inner)) throw new Error(`Nested lists are not supported: ${text}`)
        if (FENCE.test(inner))
          throw new Error(`Code blocks inside list items are not supported: ${text}`)
        items.push(`${items.pop() ?? ''} ${inner}`)
      } else if (item === null && text.trim() !== '') {
        throw new Error(
          `Text right after a list item must be indented, or follow a blank line: ${text}`,
        )
      } else break
      i++
    }
    const tag = ordered ? 'ol' : 'ul'
    return `<${tag}>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${tag}>`
  }
}

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/
const TABLE_ROW = /^ {0,3}\|.*\|\s*$/
const TABLE_SEPARATOR = /^ {0,3}\|(?:\s*:?-{3,}:?\s*\|)+\s*$/
const LIST = /^(-|\d+\.) (.+)$/
const QUOTE = /^ {0,3}>\s?(.*)$/
/**
 * Backslash escapes, code spans, **bold** and [links](url). Each part stops at the first character
 * that could end or restart it, so unclosed markup costs one pass, not one pass per character.
 */
const INLINE = /\\([!-/:-@[-`{-~])|`([^`]+)`|\*\*([^*]+)\*\*|\[([^[\]]+)\]\(([^()\s[\]]+)\)/g

function startsBlock(line: string): boolean {
  return FENCE.test(line) || LIST.test(line) || TABLE_ROW.test(line) || QUOTE.test(line)
}

function unsupported(line: string): void {
  if (/^ {0,3}#{1,6}\s/.test(line)) throw new Error(`Copy headings are not allowed here: ${line}`)
}

/** "| a | b \| c |" → ["a", "b | c"]: GFM's rule, where "\|" is a pipe inside a cell. */
function cells(row: string): string[] {
  const inner = row.trim().slice(1, -1)
  return inner.split(/(?<!\\)\|/).map((cell) => cell.replaceAll('\\|', '|').trim())
}

/** Inline code (always left to right), **bold**, [links](https://…) and backslash escapes. */
export function renderInline(text: string): string {
  let out = ''
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    out += plainText(text.slice(last, match.index))
    const [, escaped, code, bold, label, href] = match
    if (escaped !== undefined) out += escapeHtml(escaped)
    else if (code !== undefined) out += `<code dir="ltr">${escapeHtml(code)}</code>`
    else if (bold !== undefined) out += `<strong>${renderInline(bold)}</strong>`
    else if (label !== undefined && href !== undefined) {
      out += `<a href="${escapeHtml(safeHref(href))}">${renderInline(label)}</a>`
    }
    last = match.index + match[0].length
  }
  return out + plainText(text.slice(last))
}

/** Text between the markup; "](" there is a link the pattern could not read. */
function plainText(text: string): string {
  if (text.includes('](')) {
    throw new Error(
      `A link could not be read (a title, a space or parentheses in its URL?): ${text.slice(0, 120)}`,
    )
  }
  return escapeHtml(text)
}

/** https:// or a path of this site; browsers read "\" as "/", so it is never allowed. */
function safeHref(href: string): string {
  if (!href.includes('\\') && (/^https:\/\/[^/]/.test(href) || /^\/(?!\/)/.test(href))) return href
  throw new Error(`Copy links must be https: or a path of this site: ${href}`)
}
