import { readFileSync } from 'node:fs'
import { KEBAB_ID } from '@arablyzer/report-schema'
import { parseDnsExample } from './dns'
import { parseHttpExample } from './http'

export type Lang = 'ar' | 'en'

export interface CodeExample {
  /**
   * What the code is: an HTML page (or part of one), a robots.txt file, the HTTP responses a
   * page's address gets, redirects included (src/http.ts), the TXT records DNS has for its domain
   * (src/dns.ts), or JSON: an answer of the Chrome UX Report API, for a tool whose rules read real
   * visitors' data (M2.3c).
   */
  readonly lang: 'html' | 'robots.txt' | 'http' | 'dns' | 'json'
  readonly code: string
}

export interface FaqEntry {
  readonly question: string
  /** Markdown. */
  readonly answer: string
}

/** One copy file: the tool page in one language (BUILD-PLAN §6.1). */
export interface ToolCopy {
  /** The H1, in the words people search with. */
  readonly title: string
  /** The line under the H1, and the meta description: plain text. */
  readonly description: string
  /** The tool's card in the directory: one short line, plain text (front matter `summary`). */
  readonly summary: string
  /** "What this tool checks": one line of Markdown each. */
  readonly checks: readonly string[]
  /** A live example: tests check that the tool fails `wrong` and passes `right`. */
  readonly example: { readonly wrong: CodeExample; readonly right: CodeExample }
  /** Markdown. */
  readonly fix: string
  readonly faq: readonly FaqEntry[]
  /** Markdown. */
  readonly methodology: string
  /** Front matter `reviewed`; copy.ar.md must set it (true once the owner has read the Arabic). */
  readonly reviewed: boolean | null
}

type SectionKey = 'checks' | 'example' | 'fix' | 'faq' | 'methodology'
type ExampleKey = 'wrong' | 'right'

export const TOOL_HEADINGS: Readonly<
  Record<Lang, Readonly<Record<SectionKey | ExampleKey, string>>>
> = {
  ar: {
    checks: 'ماذا تفحص',
    example: 'مثال',
    fix: 'كيف تُصلح',
    faq: 'أسئلة شائعة',
    methodology: 'المنهجية',
    wrong: 'خطأ',
    right: 'صحيح',
  },
  en: {
    checks: 'What it checks',
    example: 'Example',
    fix: 'How to fix',
    faq: 'FAQ',
    methodology: 'Methodology',
    wrong: 'Wrong',
    right: 'Right',
  },
}

const SECTIONS: readonly SectionKey[] = ['checks', 'example', 'fix', 'faq', 'methodology']
const EXAMPLES: readonly ExampleKey[] = ['wrong', 'right']
const CODE_LANGS: readonly CodeExample['lang'][] = ['html', 'robots.txt', 'http', 'dns', 'json']

/** Harakat, superscript alef and tatweel: "كيف تصلح" and "كيف تُصلح" are the same heading. */
const ARABIC_MARKS = /[\u064B-\u065F\u0670\u0640]/g

/** src/tools/, next to this file. */
const TOOLS_DIR = new URL('./tools/', import.meta.url)

export function loadToolCopy(slug: string): { readonly ar: ToolCopy; readonly en: ToolCopy } {
  if (!KEBAB_ID.test(slug)) throw new TypeError(`Invalid tool slug: ${slug}`)
  const load = (lang: Lang) => {
    const file = `${slug}/copy.${lang}.md`
    return parseToolCopy(readFileSync(new URL(file, TOOLS_DIR), 'utf8'), lang, `tools/${file}`)
  }
  return { ar: load('ar'), en: load('en') }
}

/** Strict on structure, like rule copy: a missing part fails the build instead of the page. */
export function parseToolCopy(markdown: string, lang: Lang, file: string): ToolCopy {
  const fail: (message: string) => never = (message) => {
    throw new Error(`${file}: ${message}`)
  }
  const headings = TOOL_HEADINGS[lang]
  const { reviewed, summary, body } = frontMatter(markdown.replace(/\r\n?/g, '\n'), fail)

  let title: string | null = null
  const description: string[][] = []
  const sections = new Map<SectionKey, string[]>()
  const examples = new Map<ExampleKey, string[]>()
  const faq: { question: string; lines: string[] }[] = []
  let current: string[] | null = null
  let fence: string | null = null
  let section: SectionKey | null = null

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
      const key = SECTIONS.find((candidate) => same(headings[candidate], name))
      if (key === undefined) return fail(`unknown section "## ${name}"`)
      if (sections.has(key)) fail(`section "## ${name}" appears twice`)
      section = key
      current = []
      sections.set(key, current)
    } else if (level === '###') {
      const example = EXAMPLES.find((candidate) => same(headings[candidate], name))
      if (section === 'example' && example !== undefined) {
        if (examples.has(example)) fail(`"### ${name}" appears twice`)
        current = []
        examples.set(example, current)
      } else if (section === 'faq') {
        current = []
        faq.push({ question: name, lines: current })
      } else {
        fail(`"### ${name}" is outside the example and FAQ sections`)
      }
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

  const text = (key: SectionKey): string => {
    const lines = sections.get(key)
    if (lines === undefined) return fail(`missing section "## ${headings[key]}"`)
    const content = lines.join('\n').trim()
    if (content === '' && key !== 'example' && key !== 'faq') {
      fail(`section "## ${headings[key]}" is empty`)
    }
    return content
  }

  const checks = text('checks')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const item = /^- (.+)$/.exec(line.trim())?.[1]
      return item ?? fail(`"## ${headings.checks}" takes "- " items only: "${line.trim()}"`)
    })

  if (text('example') !== '')
    fail(`"## ${headings.example}" takes only "### ${headings.wrong}" and "### ${headings.right}"`)
  const example = (key: ExampleKey): CodeExample => {
    const lines = examples.get(key)
    if (lines === undefined)
      return fail(`missing "### ${headings[key]}" in "## ${headings.example}"`)
    return codeBlock(lines, `"### ${headings[key]}"`, fail)
  }

  if (text('faq') !== '' || faq.length === 0) {
    fail(`"## ${headings.faq}" needs at least one "### question" and nothing before it`)
  }
  const entries = faq.map(({ question, lines }) => {
    const answer = lines.join('\n').trim()
    if (answer === '') fail(`the answer to "${question}" is empty`)
    return { question, answer }
  })

  if (summary === null) return fail("front matter needs `summary:`, the line on the tool's card")
  return {
    title,
    description: plain(paragraphs[0]?.join(' ') ?? '', fail),
    summary: plain(summary, fail),
    checks,
    example: { wrong: example('wrong'), right: example('right') },
    fix: text('fix'),
    faq: entries,
    methodology: text('methodology'),
    reviewed,
  }
}

function frontMatter(
  text: string,
  fail: (message: string) => never,
): { reviewed: boolean | null; summary: string | null; body: string } {
  if (!text.startsWith('---\n')) return { reviewed: null, summary: null, body: text }
  const end = text.indexOf('\n---\n', 3)
  if (end === -1) fail('front matter is not closed with ---')
  let reviewed: boolean | null = null
  let summary: string | null = null
  for (const line of text.slice(4, end).split('\n')) {
    // A comment starts at " #": a summary may hold a "#" of its own, as in C#.
    const content = line.replace(/(?:^|\s)#.*$/, '').trim()
    if (content === '') continue
    const match = /^([A-Za-z]+):\s*(.*)$/.exec(content)
    const key = match?.[1]
    const value = match?.[2] ?? ''
    if (key === 'reviewed') {
      if (value !== 'true' && value !== 'false') fail('reviewed must be true or false')
      reviewed = value === 'true'
    } else if (key === 'summary') {
      if (value === '') fail('summary is empty')
      summary = value
    } else {
      fail(`unknown front matter line "${line}"`)
    }
  }
  return { reviewed, summary, body: text.slice(end + 5) }
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/m

/** Exactly one fenced code block, in a language the live-example test can run. */
function codeBlock(
  lines: readonly string[],
  where: string,
  fail: (message: string) => never,
): CodeExample {
  const content = lines.join('\n').trim()
  const match = /^(`{3,}|~{3,})([^\n]*)\n([\s\S]*)\n\1$/.exec(content)
  const code = match?.[3]
  if (code === undefined || FENCE.test(code)) {
    return FENCE.test(content)
      ? fail(`${where} takes only its code block`)
      : fail(`${where} needs one code block`)
  }
  const lang = (match?.[2] ?? '').trim()
  const known = CODE_LANGS.find((candidate) => candidate === lang)
  if (known === undefined) {
    return fail(
      `${where}: the code block must be html, robots.txt, http, dns or json, not "${lang}"`,
    )
  }
  if (known === 'http' || known === 'dns') {
    try {
      if (known === 'http') parseHttpExample(code)
      else parseDnsExample(code)
    } catch (error) {
      fail(`${where}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (known === 'json') {
    try {
      JSON.parse(code)
    } catch {
      fail(`${where}: the JSON does not parse`)
    }
  }
  return { lang: known, code }
}

function same(expected: string, heading: string): boolean {
  return expected.replace(ARABIC_MARKS, '') === heading.replace(ARABIC_MARKS, '').trim()
}

/**
 * The description is also the meta description, so it is plain text: code marks are dropped,
 * and bold or links, which would show there as written, are refused (M0.3 review).
 */
function plain(text: string, fail: (message: string) => never): string {
  if (text.includes('**') || text.includes('](')) {
    fail('the description is plain text, without bold or links')
  }
  return text.replaceAll('`', '').replace(/\s+/g, ' ').trim()
}
