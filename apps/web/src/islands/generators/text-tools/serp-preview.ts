import { serpPreview } from '@arablyzer/generators'
import { TEXT_TOOLS_UI } from '@arablyzer/i18n/text-tools'
import type { TextToolSpec } from './spec'

/** The width of a text at a result title's size, in pixels: the browser's canvas measures it. */
function measure(): (text: string) => number {
  if (typeof document === 'undefined') return (text) => Array.from(text).length * 10
  const context = document.createElement('canvas').getContext('2d')
  if (context === null) return (text) => Array.from(text).length * 10
  context.font = '20px Arial, "Segoe UI", Tahoma, sans-serif'
  return (text) => context.measureText(text).width
}

const ARABIC = /\p{Script=Arabic}/u

/** The search result preview (M10.1): how a title and a description read as a result, in the page's direction. */
export const spec: TextToolSpec = {
  kind: 'generator',
  fields: (lang) => {
    const t = TEXT_TOOLS_UI[lang].serp
    return [
      { name: 'title', kind: 'text', label: t.title },
      { name: 'description', kind: 'textarea', rows: 3, label: t.description, required: false },
      {
        name: 'url',
        kind: 'text',
        label: t.url,
        dir: 'ltr',
        required: false,
        placeholder: 'https://example.com/page',
      },
    ]
  },
  submit: (lang) => TEXT_TOOLS_UI[lang].serp.submit,
  run: ({ title = '', description = '', url = '' }, lang) => {
    const t = TEXT_TOOLS_UI[lang].serp
    if (title.trim() === '') return { error: t.empty }
    const preview = serpPreview(
      title,
      description,
      url === '' ? 'https://example.com/' : url,
      measure(),
    )
    const dir = ARABIC.test(`${title}${description}`) ? 'rtl' : 'ltr'
    const cuts = [
      ...(preview.titleCut ? [{ tone: 'warn' as const, text: t.titleCut }] : []),
      ...(preview.descriptionCut ? [{ tone: 'warn' as const, text: t.descriptionCut }] : []),
    ]
    return {
      blocks: [
        {
          kind: 'serp',
          crumbs: preview.crumbs,
          title: preview.title,
          description: preview.description,
          dir,
        },
        {
          kind: 'notes',
          items: [
            ...(cuts.length === 0 ? [{ tone: 'ok' as const, text: t.fits }] : cuts),
            { tone: 'info', text: t.note },
          ],
        },
      ],
    }
  },
}
