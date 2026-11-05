import { fixProductTitle, MAX_TITLE } from '@arablyzer/generators'
import { TEXT_TOOLS_UI } from '@arablyzer/i18n/text-tools'
import type { TextToolSpec } from './spec'

/** The title fixer (M10.1): a product title as Merchant Center asks it to be. */
export const spec: TextToolSpec = {
  kind: 'generator',
  fields: (lang) => {
    const t = TEXT_TOOLS_UI[lang].title
    return [{ name: 'title', kind: 'textarea', rows: 3, label: t.title, hint: t.hint }]
  },
  submit: (lang) => TEXT_TOOLS_UI[lang].title.submit,
  run: ({ title = '' }, lang) => {
    const t = TEXT_TOOLS_UI[lang].title
    if (title.trim() === '') return { error: t.empty }
    const result = fixProductTitle(title)
    if (result.title === '') return { error: t.empty }
    return {
      blocks: [
        { kind: 'code', label: t.fixed, text: result.title },
        {
          kind: 'notes',
          items: [
            ...(result.changes.length === 0
              ? [{ tone: 'ok' as const, text: t.unchanged }]
              : result.changes.map((change) => ({
                  tone: 'info' as const,
                  text: t.changes[change],
                }))),
            { tone: 'info', text: t.length(Array.from(result.title).length, MAX_TITLE) },
          ],
        },
      ],
    }
  },
}
