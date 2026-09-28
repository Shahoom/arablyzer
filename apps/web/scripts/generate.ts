import { mkdir, writeFile } from 'node:fs/promises'
import { RULES } from '@arablyzer/rules'
import { renderMarkdown } from '@arablyzer/seo'

/** A table in its own sideways scroller, so a narrow phone never scrolls the whole page. */
const scrollable = (html: string) =>
  html
    .replaceAll('<table>', '<div class="fix-table"><table>')
    .replaceAll('</table>', '</table></div>')

/**
 * Inline code short enough for any phone's line is marked to stay whole, so `margin-inline-end`
 * never splits at a hyphen; longer code wraps as text does. Code blocks keep their lines.
 */
const WHOLE = 32
const ENTITY = /&(?:lt|gt|amp|quot|#39);/g
const whole = (html: string) =>
  html.replace(/(?<!<pre dir="ltr">)<code dir="ltr">([^<]*)<\/code>/g, (code, text: string) =>
    text.replace(ENTITY, '_').length > WHOLE
      ? code
      : `<code dir="ltr" class="whole">${text}</code>`,
  )

// What the report page needs of each rule and cannot bundle: the rules read their copy from
// Markdown files, which Astro's build cannot follow. Written before Astro runs (build, dev,
// typecheck), into src/generated/, which git ignores: the Markdown stays the one source.
const out = new URL('../src/generated/', import.meta.url)
await mkdir(out, { recursive: true })
for (const lang of ['ar', 'en'] as const) {
  const rules = Object.fromEntries(
    RULES.map((rule) => [
      rule.id,
      { fix: whole(scrollable(renderMarkdown(rule.copy[lang].sections.fix))) },
    ]),
  )
  await writeFile(new URL(`rules.${lang}.json`, out), `${JSON.stringify(rules)}\n`)
}
