import { escapeHtml } from './html'

/**
 * A strict Markdown subset for our own copy: paragraphs, "-" and "1." lists, fenced code blocks,
 * pipe tables, inline code, **bold** and links to https: or to our own paths. Anything else is
 * either a build error or text, escaped, so copy can never inject markup.
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
    unsupported(current)
    if (TABLE_ROW.test(current)) {
      const header = cells(current)
      i++
      if (!TABLE_SEPARATOR.test(line())) {
        throw new Error(`A table needs a separator row: ${current}`)
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
      blocks.push(
        `<table><thead>${tr(header, 'th')}</thead><tbody>${rows.map((row) => tr(row, 'td')).join('')}</tbody></table>`,
      )
      continue
    }
    const list = LIST.exec(current)
    if (list !== null) {
      const ordered = /\d/.test(list[1] ?? '')
      const items: string[] = []
      while (i < lines.length) {
        const item = LIST.exec(line())
        if (item !== null && /\d/.test(item[1] ?? '') === ordered) {
          items.push(item[2] ?? '')
          i++
        } else if (items.length > 0 && /^ {2,}\S/.test(line())) {
          items.push(`${items.pop() ?? ''} ${line().trim()}`)
          i++
        } else break
      }
      const tag = ordered ? 'ol' : 'ul'
      blocks.push(
        `<${tag}>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${tag}>`,
      )
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
}

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/
const TABLE_ROW = /^ {0,3}\|.*\|\s*$/
const TABLE_SEPARATOR = /^ {0,3}\|(?:\s*:?-{3,}:?\s*\|)+\s*$/
const LIST = /^(-|\d+\.) (.+)$/
const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g

function startsBlock(line: string): boolean {
  return FENCE.test(line) || LIST.test(line) || TABLE_ROW.test(line)
}

function unsupported(line: string): void {
  if (/^ {0,3}#{1,6}\s/.test(line)) throw new Error(`Copy headings are not allowed here: ${line}`)
  if (/^ {0,3}>/.test(line)) throw new Error(`Block quotes are not supported: ${line}`)
}

/** "| a | b \| c |" → ["a", "b | c"]: GFM's rule, where "\|" is a pipe inside a cell. */
function cells(row: string): string[] {
  const inner = row.trim().slice(1, -1)
  return inner.split(/(?<!\\)\|/).map((cell) => cell.replaceAll('\\|', '|').trim())
}

/** Inline code (always left to right), **bold** and [links](https://…). */
export function renderInline(text: string): string {
  let out = ''
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    out += escapeHtml(text.slice(last, match.index))
    const [, code, bold, label, href] = match
    if (code !== undefined) out += `<code dir="ltr">${escapeHtml(code)}</code>`
    else if (bold !== undefined) out += `<strong>${renderInline(bold)}</strong>`
    else if (label !== undefined && href !== undefined) {
      out += `<a href="${escapeHtml(safeHref(href))}">${renderInline(label)}</a>`
    }
    last = match.index + match[0].length
  }
  return out + escapeHtml(text.slice(last))
}

function safeHref(href: string): string {
  if (/^https:\/\/[^/]/.test(href) || /^\/(?!\/)/.test(href)) return href
  throw new Error(`Copy links must be https: or a path of this site: ${href}`)
}
