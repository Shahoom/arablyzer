import type { PageFacts, ScriptElement, SourceLocation } from '@arablyzer/collectors'
import { checkJson } from '../../lib/json-check'
import { defineRule } from '../../rule'

export const rule = defineRule({
  id: 'jsonld-syntax-error',
  version: '1.0.0',
  category: 'schema',
  severity: 'serious',
  needs: ['html'],
  messages: [
    'trailing-comma',
    'unexpected-character',
    'control-character',
    'invalid-escape',
    'unexpected-end',
  ],
  appliesTo: (page) => jsonLdBlocks(page).some((script) => script.text.trim() !== ''),
  detect: ({ page }) =>
    jsonLdBlocks(page).flatMap((script, index) => {
      if (script.text.trim() === '') return []
      const error = checkJson(script.text)
      if (error === null) return []
      const position = documentPosition(script, error.offset)
      const snippet = lineAround(script.text, error.offset)
      return [
        {
          message: error.problem,
          values: {
            block: index + 1,
            line: position.line,
            column: position.column,
            problem: error.problem,
            ...(error.character === undefined ? {} : { character: error.character }),
          },
          selector: script.selector,
          ...(snippet === '' ? {} : { snippet }),
          ...(script.textLocation === null ? {} : { location: position }),
          key: String(index + 1),
        },
      ]
    }),
})

/** <script type="application/ld+json">, with any letter case and parameters. */
function jsonLdBlocks(page: PageFacts): ScriptElement[] {
  return (page.html?.scripts ?? []).filter(
    (script) => (script.type ?? '').split(';')[0]?.trim().toLowerCase() === 'application/ld+json',
  )
}

/** Where an offset in the script text is in the page; relative to the block without a location. */
function documentPosition(script: ScriptElement, offset: number): SourceLocation {
  const start = script.textLocation ?? { line: 1, column: 1 }
  const before = script.text.slice(0, offset)
  const newlines = before.split('\n').length - 1
  if (newlines === 0) return { line: start.line, column: start.column + offset }
  return { line: start.line + newlines, column: offset - before.lastIndexOf('\n') }
}

/** The line of JSON with the problem, or the last non-empty line before it. */
function lineAround(text: string, offset: number): string {
  const lines = text.slice(0, offset).split('\n')
  const current = `${lines.at(-1) ?? ''}${text.slice(offset).split('\n')[0] ?? ''}`
  for (const line of [current, ...lines.slice(0, -1).reverse()]) {
    const trimmed = line.trim().replace(/\s+/g, ' ')
    if (trimmed !== '') return trimmed
  }
  return ''
}
