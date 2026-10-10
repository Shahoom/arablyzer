import type { Block } from './model'

/** The blocks a PDF can draw: paragraphs, lists and code (the rules' "how to fix" sections need no more). */
export type FixBlock = Extract<Block, { t: 'p' | 'list' | 'code' }>

const LIST_ITEM = /^(?:[-*]|\d+[.)])\s+(.*)$/

/**
 * The small Markdown the rules' fix sections are written in: paragraphs, `-` and `1.` lists,
 * fenced code, and `code` spans (which stay in the text, in backticks, for the page to draw). Bold
 * and links lose their marks. Anything it does not know stays a paragraph.
 */
export function fixBlocks(markdown: string): FixBlock[] {
  const blocks: FixBlock[] = []
  const lines = markdown.replaceAll('\r\n', '\n').split('\n')
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ t: 'p', text: plain(paragraph.join(' ')) })
    if (list !== null) blocks.push({ t: 'list', ordered: list.ordered, items: list.items })
    paragraph = []
    list = null
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? ''
    if (line.trimStart().startsWith('```')) {
      flush()
      const code: string[] = []
      for (
        index++;
        index < lines.length && !(lines[index] ?? '').trimStart().startsWith('```');
        index++
      ) {
        code.push(lines[index] ?? '')
      }
      blocks.push({ t: 'code', text: code.join('\n') })
      continue
    }
    if (line.trim() === '') {
      flush()
      continue
    }
    // A table is kept as it is written, in the mono face: its columns line up.
    if (line.trimStart().startsWith('|')) {
      flush()
      const table: string[] = [line.trim()]
      while ((lines[index + 1] ?? '').trimStart().startsWith('|'))
        table.push((lines[++index] ?? '').trim())
      blocks.push({ t: 'code', text: table.join('\n') })
      continue
    }
    const item = LIST_ITEM.exec(line.trim())
    if (item !== null) {
      const ordered = /^\d/.test(line.trim())
      if (list !== null && list.ordered !== ordered) flush()
      list ??= { ordered, items: [] }
      list.items.push(plain(item[1] ?? ''))
    } else if (list !== null && /^\s+\S/.test(line)) {
      // A continuation of the last list item.
      const last = list.items.length - 1
      list.items[last] = `${list.items[last] ?? ''} ${plain(line.trim())}`
    } else {
      if (list !== null) flush()
      paragraph.push(line.trim())
    }
  }
  flush()
  return blocks
}

/** Bold, italics and links without their marks; backticks stay. */
function plain(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, '$1')
}
