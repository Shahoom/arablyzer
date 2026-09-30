export type Lang = 'ar' | 'en'

export interface FaqEntry {
  readonly question: string
  /** Markdown. */
  readonly answer: string
}

/** What a kind of document has: its sections' headings in each language, and which it needs. */
export interface DocumentSchema<K extends string> {
  readonly headings: Readonly<Record<Lang, Readonly<Record<K, string>>>>
  /** In the order they must come; a section left out of `required` may be missing. */
  readonly order: readonly K[]
  readonly required: readonly K[]
  /** The section of `### question` and answer pairs, if the kind has one. */
  readonly faq?: K
}

/** One copy file of a guide or a glossary term, its Markdown parsed. */
export interface DocumentCopy<K extends string> {
  /** The H1, in the words people search with. */
  readonly title: string
  /** The line under the H1, and the meta description: plain text. */
  readonly description: string
  /** Markdown of each section present. */
  readonly sections: Readonly<Partial<Record<K, string>>>
  readonly faq: readonly FaqEntry[]
  /** Front matter `reviewed`; copy.ar.md must set it (true once the owner has read the Arabic). */
  readonly reviewed: boolean | null
}

/** Harakat, superscript alef and tatweel: "كيف تصلح" and "كيف تُصلح" are the same heading. */
const ARABIC_MARKS = /[ً-ٰٟـ]/g
const same = (a: string, b: string) =>
  a.replace(ARABIC_MARKS, '').trim() === b.replace(ARABIC_MARKS, '').trim()

/**
 * A guide's or a term's copy, strict on structure as rule and tool copy are: a missing part, or
 * a part out of order, fails the build instead of the page.
 */
export function parseDocument<K extends string>(
  markdown: string,
  lang: Lang,
  file: string,
  schema: DocumentSchema<K>,
): DocumentCopy<K> {
  const fail: (message: string) => never = (message) => {
    throw new Error(`${file}: ${message}`)
  }
  const headings = schema.headings[lang]
  const { reviewed, body } = frontMatter(markdown.replace(/\r\n?/g, '\n'), fail)

  let title: string | null = null
  const description: string[][] = []
  const sections = new Map<K, string[]>()
  const faq: { question: string; lines: string[] }[] = []
  let current: string[] | null = null
  let section: K | null = null
  let fence: string | null = null

  for (const line of body.split('\n')) {
    const fenceMark = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (fenceMark !== undefined) {
      if (fence === null) fence = fenceMark
      else if (fenceMark.startsWith(fence)) fence = null
    }
    const heading =
      fence === null && fenceMark === undefined ? /^(#{1,3})\s+(.*\S)\s*$/.exec(line) : null
    const level = heading?.[1]
    const name = heading?.[2] ?? ''
    if (level === '#') {
      if (title !== null) fail('more than one # title')
      title = name
      current = null
    } else if (level === '##') {
      const key = schema.order.find((candidate) => same(headings[candidate], name))
      if (key === undefined) return fail(`unknown section "## ${name}"`)
      if (sections.has(key)) fail(`section "## ${name}" appears twice`)
      const previous = section === null ? -1 : schema.order.indexOf(section)
      if (schema.order.indexOf(key) < previous) fail(`"## ${name}" is out of order`)
      section = key
      current = []
      sections.set(key, current)
    } else if (level === '###') {
      if (section === null || section !== schema.faq) {
        return fail(`"### ${name}" is outside the questions section`)
      }
      current = []
      faq.push({ question: name, lines: current })
    } else if (current !== null) {
      current.push(line)
    } else if (title !== null && section === null) {
      // The description: the text between the title and the first section.
      if (line.trim() === '') {
        if ((description.at(-1)?.length ?? 0) > 0) description.push([])
      } else {
        if (description.length === 0) description.push([])
        description.at(-1)?.push(line.trim())
      }
    } else if (line.trim() !== '') {
      fail(
        title === null
          ? 'missing # title before the text'
          : `text outside a section: "${line.trim()}"`,
      )
    }
  }
  if (fence !== null) fail('a code block is not closed')
  if (title === null || title.trim() === '') return fail('missing # title')
  const paragraphs = description.filter((lines) => lines.length > 0)
  if (paragraphs.length === 0) fail('missing the description under the title')
  if (paragraphs.length > 1) fail('the description must be one paragraph')

  const texts: Partial<Record<K, string>> = {}
  for (const key of schema.order) {
    const lines = sections.get(key)
    if (lines === undefined) {
      if (schema.required.includes(key)) fail(`missing section "## ${headings[key]}"`)
      continue
    }
    const content = lines.join('\n').trim()
    if (key === schema.faq) {
      if (content !== '' || faq.length === 0) {
        fail(`"## ${headings[key]}" needs at least one "### question" and nothing before it`)
      }
    } else if (content === '') {
      fail(`section "## ${headings[key]}" is empty`)
    }
    texts[key] = content
  }
  const entries = faq.map(({ question, lines }) => {
    const answer = lines.join('\n').trim()
    if (answer === '') fail(`the answer to "${question}" is empty`)
    return { question, answer }
  })
  return {
    title,
    description: plain(paragraphs[0]?.join(' ') ?? '', fail),
    sections: texts,
    faq: entries,
    reviewed,
  }
}

function frontMatter(
  text: string,
  fail: (message: string) => never,
): { reviewed: boolean | null; body: string } {
  if (!text.startsWith('---\n')) return { reviewed: null, body: text }
  const end = text.indexOf('\n---\n', 3)
  if (end === -1) fail('front matter is not closed with ---')
  let reviewed: boolean | null = null
  for (const line of text.slice(4, end).split('\n')) {
    const content = line.replace(/(?:^|\s)#.*$/, '').trim()
    if (content === '') continue
    const match = /^([A-Za-z]+):\s*(.*)$/.exec(content)
    if (match?.[1] !== 'reviewed') fail(`unknown front matter line "${line}"`)
    const value = match[2]
    if (value !== 'true' && value !== 'false') fail('reviewed must be true or false')
    reviewed = value === 'true'
  }
  return { reviewed, body: text.slice(end + 5) }
}

/** A description is plain text: it goes into the meta description and the page's first line. */
function plain(text: string, fail: (message: string) => never): string {
  if (/[`*[\]<>]/.test(text)) fail(`the description is plain text, without Markdown: "${text}"`)
  return text
}
