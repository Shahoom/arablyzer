import { mkdir, writeFile } from 'node:fs/promises'
import { RULES } from '@arablyzer/rules'
import { renderMarkdown } from '@arablyzer/seo'
import { fixHtml } from './fix-html'

// What the report page needs of each rule and cannot bundle: the rules read their copy from
// Markdown files, which Astro's build cannot follow. Written before Astro runs (build, dev,
// typecheck), into src/generated/, which git ignores: the Markdown stays the one source.
const out = new URL('../src/generated/', import.meta.url)
await mkdir(out, { recursive: true })
for (const lang of ['ar', 'en'] as const) {
  const rules = Object.fromEntries(
    RULES.map((rule) => [rule.id, { fix: fixHtml(renderMarkdown(rule.copy[lang].sections.fix)) }]),
  )
  await writeFile(new URL(`rules.${lang}.json`, out), `${JSON.stringify(rules)}\n`)
}
