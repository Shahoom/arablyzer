import { decodeError, ERRORS } from '@arablyzer/generators'
import { TEXT_TOOLS_UI } from '@arablyzer/i18n/text-tools'
import { localePath, PATHS } from '@arablyzer/seo/site'
import type { Block, TextToolSpec } from './spec'

/** At most this many messages are explained: a pasted page can name several. */
const MOST = 2

/** The error decoder (M10.1): a Search Console or Merchant Center message, in plain words. */
export const spec: TextToolSpec = {
  kind: 'paste',
  fields: (lang) => {
    const t = TEXT_TOOLS_UI[lang].errors
    return [{ name: 'message', kind: 'textarea', rows: 3, label: t.message, hint: t.hint }]
  },
  submit: (lang) => TEXT_TOOLS_UI[lang].errors.submit,
  run: ({ message = '' }, lang) => {
    const t = TEXT_TOOLS_UI[lang].errors
    if (message.trim() === '') return { error: t.empty }
    const found = decodeError(message).slice(0, MOST)
    if (found.length === 0) {
      return {
        blocks: [
          { kind: 'text', text: t.unknown },
          {
            kind: 'notes',
            label: t.known,
            items: ERRORS.map((entry) => ({ tone: 'info' as const, text: entry[lang].name })),
          },
        ],
      }
    }
    return {
      blocks: found.flatMap((entry): Block[] => {
        const words = entry[lang]
        return [
          { kind: 'text', label: words.name, text: words.means },
          { kind: 'notes', label: t.cause, items: [{ tone: 'info', text: words.cause }] },
          {
            kind: 'notes',
            label: t.fix,
            items: words.fix.map((text) => ({ tone: 'ok' as const, text })),
          },
          ...(entry.tool === null
            ? []
            : [
                {
                  kind: 'link' as const,
                  text: t.tool,
                  href: localePath(lang, PATHS.tool(entry.tool)),
                },
              ]),
        ]
      }),
    }
  },
}
