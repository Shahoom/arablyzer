import { metaTags } from '@arablyzer/generators'
import { TEXT_TOOLS_UI } from '@arablyzer/i18n/text-tools'
import type { Block, TextToolSpec } from './spec'

/** The meta tag generator (M10.1): the head of a page, with the tags the page checks read. */
export const spec: TextToolSpec = {
  kind: 'generator',
  fields: (lang) => {
    const t = TEXT_TOOLS_UI[lang].meta
    return [
      {
        name: 'lang',
        kind: 'select',
        label: t.lang,
        options: [
          { value: 'ar', label: t.langs.ar },
          { value: 'en', label: t.langs.en },
        ],
      },
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
      { name: 'siteName', kind: 'text', label: t.siteName, required: false },
      {
        name: 'image',
        kind: 'text',
        label: t.image,
        dir: 'ltr',
        required: false,
        placeholder: 'https://example.com/og.png',
      },
      {
        name: 'robots',
        kind: 'select',
        label: t.robots,
        options: [
          { value: 'index', label: t.robotsOptions.index },
          { value: 'noindex', label: t.robotsOptions.noindex },
        ],
      },
      {
        name: 'type',
        kind: 'select',
        label: t.type,
        options: [
          { value: 'website', label: t.types.website },
          { value: 'article', label: t.types.article },
        ],
      },
    ]
  },
  submit: (lang) => TEXT_TOOLS_UI[lang].meta.submit,
  run: (values, lang) => {
    const t = TEXT_TOOLS_UI[lang].meta
    const result = metaTags({
      lang: values.lang === 'en' ? 'en' : 'ar',
      title: values.title ?? '',
      description: values.description ?? '',
      url: values.url ?? '',
      siteName: values.siteName ?? '',
      image: values.image ?? '',
      noindex: values.robots === 'noindex',
      article: values.type === 'article',
    })
    if (result.problems.includes('title-blank')) return { error: t.empty }
    const blocks: Block[] = [
      { kind: 'code', label: t.htmlTag, text: result.htmlTag },
      { kind: 'code', label: t.head, text: result.head },
      {
        kind: 'notes',
        items: [
          ...result.problems.map((problem) => ({
            tone: 'warn' as const,
            text: t.problems[problem],
          })),
          ...(result.head.includes('og:image') ? [] : [{ tone: 'warn' as const, text: t.noImage }]),
          { tone: 'info', text: t.lengths(result.titleLength, result.descriptionLength) },
        ],
      },
    ]
    return { blocks }
  },
}
