import { readFileSync } from 'node:fs'
import { renderMarkdown } from '@arablyzer/seo/markdown'
import { fixHtml } from '../src/lib/fix-html'
import type { MethodologyDoc, MethodologySection } from '../src/lib/methodology'

// The methodology page's two languages, for src/generated/methodology.json: generate.ts writes it.

const SOURCE = new URL('../../../docs/methodology.md', import.meta.url)

interface Section {
  readonly title: string
  readonly body: string[]
  readonly parts: { readonly title: string; readonly body: string[] }[]
}

/**
 * docs/methodology.md: the Arabic, then, after a line of three dashes, the English. Each is a
 * # title, a paragraph that says what the page is, and ## sections with ### parts. The two
 * languages have the same sections, which share their ids.
 */
export function methodologyData(
  markdown: string = readFileSync(SOURCE, 'utf8'),
): Record<'ar' | 'en', MethodologyDoc> {
  const halves = markdown.replace(/\r\n?/g, '\n').split(/\n---\n/)
  if (halves.length !== 2) {
    throw new Error('docs/methodology.md: the Arabic, a line of ---, then the English')
  }
  const [ar = '', en = ''] = halves
  const arabic = parse(ar, 'ar')
  const english = parse(en, 'en')
  if (arabic.sections.length !== english.sections.length) {
    throw new Error('docs/methodology.md: the Arabic and the English have different sections')
  }
  const ids = english.sections.map((section) => slug(section.title))
  return { ar: document(arabic, ids), en: document(english, ids) }
}

function parse(text: string, lang: string) {
  const fail = (message: string): never => {
    throw new Error(`docs/methodology.md (${lang}): ${message}`)
  }
  let title: string | null = null
  const intro: string[] = []
  const sections: Section[] = []
  let fence = false
  for (const line of text.split('\n')) {
    if (/^ {0,3}(`{3,}|~{3,})/.test(line)) fence = !fence
    const heading = fence ? null : /^(#{1,3}) (.+)$/.exec(line)
    const section = sections.at(-1)
    if (heading?.[1] === '#') {
      if (title !== null) fail('more than one # title')
      title = heading[2] ?? ''
    } else if (heading?.[1] === '##') {
      sections.push({ title: heading[2] ?? '', body: [], parts: [] })
    } else if (heading?.[1] === '###') {
      if (section === undefined) return fail(`"${line}" before any ## section`)
      section.parts.push({ title: heading[2] ?? '', body: [] })
    } else if (section === undefined) {
      intro.push(line)
    } else {
      ;(section.parts.at(-1)?.body ?? section.body).push(line)
    }
  }
  if (title === null) return fail('no # title')
  const description = intro.join(' ').replace(/\s+/g, ' ').trim()
  if (description === '') fail('no paragraph under the title')
  if (sections.length === 0) fail('no ## sections')
  return { title, description, sections }
}

function document(parsed: ReturnType<typeof parse>, ids: readonly string[]): MethodologyDoc {
  const html = (lines: readonly string[]) => fixHtml(renderMarkdown(lines.join('\n')))
  return {
    title: parsed.title,
    description: parsed.description,
    sections: parsed.sections.map((section, index): MethodologySection => ({
      id: ids[index] ?? `section-${String(index + 1)}`,
      title: section.title,
      html: html(section.body),
      parts: section.parts.map((part) => ({ title: part.title, html: html(part.body) })),
    })),
  }
}

/** "Each rule's result" → "each-rules-result". */
function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
