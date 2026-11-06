import { breadcrumbMarkup } from '@arablyzer/generators'
import { TEXT_TOOLS_UI } from '@arablyzer/i18n/text-tools'
import type { TextToolSpec } from './spec'

/** The breadcrumb markup generator (M10.2): a BreadcrumbList from the trail's steps. */
export const spec: TextToolSpec = {
  kind: 'generator',
  fields: (lang) => {
    const t = TEXT_TOOLS_UI[lang].breadcrumb
    return [
      {
        name: 'steps',
        kind: 'textarea',
        rows: 5,
        label: t.steps,
        hint: t.stepsHint,
        placeholder:
          'الرئيسية | https://example.com/\nالعطور | https://example.com/perfumes\nعطر العود الملكي',
      },
    ]
  },
  submit: (lang) => TEXT_TOOLS_UI[lang].breadcrumb.submit,
  run: ({ steps = '' }, lang) => {
    const t = TEXT_TOOLS_UI[lang].breadcrumb
    const result = breadcrumbMarkup(steps)
    if (result.problems.some(({ problem }) => problem === 'too-few')) return { error: t.empty }
    return {
      blocks: [
        { kind: 'code', label: t.block, text: result.jsonLd },
        {
          kind: 'notes',
          items: [
            { tone: 'ok', text: t.count(result.count) },
            ...result.problems.map(({ problem, line, input }) => ({
              tone: 'warn' as const,
              text: t.problems[problem](line, input),
            })),
            { tone: 'info', text: t.where },
          ],
        },
      ],
    }
  },
}
