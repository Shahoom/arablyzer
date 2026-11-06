import { faqMarkup, parseFaq } from '@arablyzer/generators'
import { TEXT_TOOLS_UI } from '@arablyzer/i18n/text-tools'
import type { TextToolSpec } from './spec'

/** The FAQ markup generator (M10.2): the page's text and the FAQPage markup, with the same words. */
export const spec: TextToolSpec = {
  kind: 'generator',
  fields: (lang) => {
    const t = TEXT_TOOLS_UI[lang].faq
    return [{ name: 'items', kind: 'textarea', rows: 8, label: t.items, hint: t.itemsHint }]
  },
  submit: (lang) => TEXT_TOOLS_UI[lang].faq.submit,
  run: ({ items = '' }, lang) => {
    const t = TEXT_TOOLS_UI[lang].faq
    const parsed = parseFaq(items)
    if (parsed.length === 0) return { error: t.empty }
    const { html, jsonLd } = faqMarkup(parsed)
    return {
      blocks: [
        { kind: 'code', label: t.page, text: html },
        { kind: 'code', label: t.markup, text: jsonLd },
        {
          kind: 'notes',
          items: [
            { tone: 'ok', text: t.count(parsed.length) },
            { tone: 'info', text: t.match },
            { tone: 'info', text: t.limited },
          ],
        },
      ],
    }
  },
}
