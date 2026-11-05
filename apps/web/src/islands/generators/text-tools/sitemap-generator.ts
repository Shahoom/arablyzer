import { sitemapXml } from '@arablyzer/generators'
import { TEXT_TOOLS_UI } from '@arablyzer/i18n/text-tools'
import type { TextToolSpec } from './spec'

/** The sitemap generator (M10.1): the sitemaps protocol's file from a list of addresses. */
export const spec: TextToolSpec = {
  kind: 'generator',
  fields: (lang) => {
    const t = TEXT_TOOLS_UI[lang].sitemap
    return [
      {
        name: 'urls',
        kind: 'textarea',
        rows: 8,
        label: t.urls,
        hint: t.urlsHint,
        dir: 'ltr',
        placeholder: 'https://example.com/\nhttps://example.com/products 2026-03-05',
      },
    ]
  },
  submit: (lang) => TEXT_TOOLS_UI[lang].sitemap.submit,
  run: ({ urls = '' }, lang) => {
    const t = TEXT_TOOLS_UI[lang].sitemap
    const result = sitemapXml(urls)
    if (result.count === 0) return { error: t.empty }
    return {
      blocks: [
        { kind: 'code', label: t.file, text: result.xml },
        {
          kind: 'notes',
          items: [
            { tone: 'ok', text: t.count(result.count) },
            ...result.skipped.slice(0, 20).map(({ line, reason }) => ({
              tone: 'warn' as const,
              text: t.skipped[reason](line),
            })),
          ],
        },
      ],
    }
  },
}
