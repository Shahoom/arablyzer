import { ruleById } from '@arablyzer/rules'
import { TOOL_DEFINITIONS } from '@arablyzer/tools/registry'
import type { DocumentCopy, Lang } from '../src/document'
import { defineFixGuide } from '../src/fix'
import { FIX_GUIDE_DEFINITIONS } from '../src/fix-registry'
import { defineTerm } from '../src/glossary'
import { GLOSSARY_DEFINITIONS } from '../src/glossary-registry'

// Checks the copy of the guides or terms named, as it is written, before every other is:
//   tsx scripts/check-copy.ts fix url-marked-noindex soft-404
//   tsx scripts/check-copy.ts glossary canonical-url hreflang
// It asks what test/completeness.test.ts asks, and prints each problem.

const ARABIC_LETTER = /(?=\p{L})\p{Script=Arabic}/u
const MARKS = /[‎‏؜‪-‮⁦-⁩]/u
const TOOLS = new Set(TOOL_DEFINITIONS.map((tool) => tool.slug))

function copyProblems(copy: Readonly<Record<Lang, DocumentCopy<string>>>): string[] {
  const problems: string[] = []
  if (!ARABIC_LETTER.test(copy.ar.title)) problems.push('the Arabic title has no Arabic')
  if (!ARABIC_LETTER.test(copy.ar.description))
    problems.push('the Arabic description has no Arabic')
  if (typeof copy.ar.reviewed !== 'boolean') problems.push('copy.ar.md needs "reviewed: false"')
  for (const lang of ['ar', 'en'] as const) {
    const { description, sections, title } = copy[lang]
    if (description.length < 80 || description.length > 175) {
      problems.push(
        `${lang}: the description is ${String(description.length)} characters, not 80 to 175`,
      )
    }
    if (!(sections.references ?? '').includes('](https://'))
      problems.push(`${lang}: no https link in the references`)
    if (MARKS.test([title, description, ...Object.values(sections)].join('\n'))) {
      problems.push(`${lang}: directional marks`)
    }
  }
  if (copy.ar.faq.length !== copy.en.faq.length) problems.push('not the same number of questions')
  if (Object.keys(copy.ar.sections).join() !== Object.keys(copy.en.sections).join()) {
    problems.push('not the same sections in both languages')
  }
  return problems
}

const [kind, ...slugs] = process.argv.slice(2)
let failed = false
for (const slug of slugs) {
  let problems: string[]
  try {
    if (kind === 'fix') {
      const definition = FIX_GUIDE_DEFINITIONS.find((guide) => guide.slug === slug)
      if (definition === undefined) throw new Error(`no guide ${slug}`)
      const guide = defineFixGuide(definition)
      problems = copyProblems(guide.copy)
      for (const lang of ['ar', 'en'] as const) {
        if (!guide.copy[lang].title.includes(guide.message[lang])) {
          problems.push(`${lang}: the title does not hold the message «${guide.message[lang]}»`)
        }
      }
      for (const tool of guide.tools) if (!TOOLS.has(tool)) problems.push(`no tool ${tool}`)
      for (const rule of guide.rules)
        if (ruleById(rule) === undefined) problems.push(`no rule ${rule}`)
    } else if (kind === 'glossary') {
      const definition = GLOSSARY_DEFINITIONS.find((term) => term.slug === slug)
      if (definition === undefined) throw new Error(`no term ${slug}`)
      const term = defineTerm(definition)
      problems = copyProblems(term.copy)
      const words = Object.values(term.copy.en.sections).join(' ').split(/\s+/).length
      if (words < 120)
        problems.push(`the English sections have ${String(words)} words, fewer than 120`)
    } else {
      throw new Error('the first argument is fix or glossary')
    }
  } catch (error) {
    problems = [error instanceof Error ? error.message : String(error)]
  }
  if (problems.length === 0) console.log(`${slug}: ok`)
  else {
    failed = true
    console.log(`${slug}:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
  }
}
if (failed) process.exitCode = 1
