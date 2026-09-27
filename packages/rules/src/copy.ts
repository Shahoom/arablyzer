import { readFileSync } from 'node:fs'
import { KEBAB_ID, type JsonValue } from '@arablyzer/report-schema'

export type Lang = 'ar' | 'en'

export interface RuleCopySections {
  readonly why: string
  readonly fix: string
  readonly detect: string
  readonly references: string
}

/** One copy file: the rule-library page in one language, plus the finding messages. */
export interface RuleCopy {
  readonly title: string
  /** Plain-text templates by message id; `{name}` is filled from the finding's values. */
  readonly messages: Readonly<Record<string, string>>
  /** Markdown bodies of the page sections. */
  readonly sections: RuleCopySections
  /** Front matter `reviewed`; copy.ar.md must set it (true once the owner has read the Arabic). */
  readonly reviewed: boolean | null
}

type SectionKey = 'messages' | keyof RuleCopySections

export const SECTION_HEADINGS: Readonly<Record<Lang, Readonly<Record<SectionKey, string>>>> = {
  ar: {
    messages: 'الرسائل',
    why: 'لماذا يهم',
    fix: 'كيف تُصلح',
    detect: 'كيف نكشف',
    references: 'المراجع',
  },
  en: {
    messages: 'Messages',
    why: 'Why it matters',
    fix: 'How to fix',
    detect: 'How we detect',
    references: 'References',
  },
}

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g

/** Harakat, superscript alef and tatweel: "كيف تصلح" and "كيف تُصلح" are the same heading. */
const ARABIC_MARKS = /[\u064b-\u065f\u0670\u0640]/g

/** src/rules/, next to this file (and next to the bundled CLI, where the build copies it). */
const RULES_DIR = new URL('./rules/', import.meta.url)

export function loadRuleCopy(id: string): { readonly ar: RuleCopy; readonly en: RuleCopy } {
  if (!KEBAB_ID.test(id)) throw new TypeError(`Invalid rule id: ${id}`)
  const load = (lang: Lang) => {
    const file = `${id}/copy.${lang}.md`
    return parseRuleCopy(readFileSync(new URL(file, RULES_DIR), 'utf8'), lang, `rules/${file}`)
  }
  return { ar: load('ar'), en: load('en') }
}

/** Strict on structure, so a missing section fails the build instead of shipping an empty page. */
export function parseRuleCopy(markdown: string, lang: Lang, file: string): RuleCopy {
  const fail: (message: string) => never = (message) => {
    throw new Error(`${file}: ${message}`)
  }
  let text = markdown.replace(/\r\n?/g, '\n')
  let reviewed: boolean | null = null
  if (text.startsWith('---\n')) {
    const end = text.indexOf('\n---\n', 3)
    if (end === -1) fail('front matter is not closed with ---')
    for (const line of text.slice(4, end).split('\n')) {
      const content = line.replace(/#.*$/, '').trim()
      if (content === '') continue
      const match = /^([A-Za-z]+):\s*(.*)$/.exec(content)
      if (match?.[1] !== 'reviewed') fail(`unknown front matter line "${line}"`)
      const value = match[2]
      if (value !== 'true' && value !== 'false') fail('reviewed must be true or false')
      reviewed = value === 'true'
    }
    text = text.slice(end + 5)
  }

  const headings = SECTION_HEADINGS[lang]
  let title: string | null = null
  const sections = new Map<SectionKey, string[]>()
  const messages = new Map<string, string[]>()
  let section: SectionKey | null = null
  let message: string | null = null
  let fence: string | null = null

  for (const line of text.split('\n')) {
    const fenceMark = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (fenceMark !== undefined) {
      if (fence === null) fence = fenceMark
      else if (fenceMark.startsWith(fence)) fence = null
    }
    const heading =
      fence === null && fenceMark === undefined ? /^(#{1,3})\s+(.*\S)\s*$/.exec(line) : null
    if (heading?.[1] === '#') {
      if (title !== null) fail('more than one # title')
      title = heading[2] ?? ''
      section = null
      message = null
    } else if (heading?.[1] === '##') {
      const name = heading[2] ?? ''
      const key = (Object.keys(headings) as SectionKey[]).find(
        (candidate) => normalize(headings[candidate]) === normalize(name),
      )
      if (key === undefined) return fail(`unknown section "## ${name}"`)
      if (sections.has(key)) fail(`section "## ${name}" appears twice`)
      sections.set(key, [])
      section = key
      message = null
    } else if (heading?.[1] === '###') {
      const id = heading[2] ?? ''
      if (section !== 'messages') fail(`"### ${id}" is outside the messages section`)
      if (!KEBAB_ID.test(id)) fail(`message id "${id}" is not kebab-case`)
      if (messages.has(id)) fail(`message "${id}" appears twice`)
      messages.set(id, [])
      message = id
    } else if (message !== null) {
      messages.get(message)?.push(line)
    } else if (section !== null && section !== 'messages') {
      sections.get(section)?.push(line)
    } else if (line.trim() !== '') {
      fail(
        section === 'messages'
          ? `text before the first "### <message-id>": "${line.trim()}"`
          : `text outside a section: "${line.trim()}"`,
      )
    }
  }

  if (title === null || title.trim() === '') return fail('missing # title')
  const body = (key: keyof RuleCopySections): string => {
    const lines = sections.get(key)
    if (lines === undefined) return fail(`missing section "## ${headings[key]}"`)
    const content = lines.join('\n').trim()
    if (content === '') fail(`section "## ${headings[key]}" is empty`)
    return content
  }
  const sectionBodies: RuleCopySections = {
    why: body('why'),
    fix: body('fix'),
    detect: body('detect'),
    references: body('references'),
  }
  if (!sections.has('messages') || messages.size === 0) fail('no messages')
  const templates: Record<string, string> = {}
  for (const [id, lines] of messages) {
    const template = lines.join(' ').replaceAll('`', '').replace(/\s+/g, ' ').trim()
    if (template === '') fail(`message "${id}" is empty`)
    templates[id] = template
  }
  return { title, messages: templates, sections: sectionBodies, reviewed }
}

function normalize(heading: string): string {
  return heading.replace(ARABIC_MARKS, '').trim()
}

/** Placeholder names in a template, in order. */
export function placeholders(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1] ?? '')
}

/** Fills `{name}` from the finding's values; a missing value is a bug in the rule. */
export function renderMessage(
  template: string,
  values: Readonly<Record<string, JsonValue>> = {},
): string {
  return template.replace(PLACEHOLDER, (_match, name: string) => {
    const value = values[name]
    if (value === undefined) throw new Error(`No value for {${name}} in "${template}"`)
    return typeof value === 'string' ? value : JSON.stringify(value)
  })
}
