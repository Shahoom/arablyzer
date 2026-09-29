import { mkdir, writeFile } from 'node:fs/promises'
import { RULES } from '@arablyzer/rules'
import { renderMarkdown } from '@arablyzer/seo'
import { fixHtml } from '../src/lib/fix-html'
import { libraryData } from './rule-data'
import { toolsData } from './tool-data'

// What the report page needs of each rule, the tool pages of each tool, and the rule library of
// each rule, which Astro cannot bundle: rules and tools read their copy from Markdown files, which Astro's build cannot follow.
// Written before Astro runs (build, dev, typecheck), into src/generated/, which git ignores: the
// Markdown stays the one source.
const out = new URL('../src/generated/', import.meta.url)
await mkdir(out, { recursive: true })
for (const lang of ['ar', 'en'] as const) {
  const rules = Object.fromEntries(
    RULES.map((rule) => [rule.id, { fix: fixHtml(renderMarkdown(rule.copy[lang].sections.fix)) }]),
  )
  await writeFile(new URL(`rules.${lang}.json`, out), `${JSON.stringify(rules)}\n`)
}
await writeFile(new URL('tools.json', out), `${JSON.stringify(toolsData())}\n`)
await writeFile(new URL('library.json', out), `${JSON.stringify(libraryData())}\n`)
