import { checkJson } from '../../lib/json-check'
import { documentPosition, jsonLdBlocks, lineAround } from '../../lib/jsonld'
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
