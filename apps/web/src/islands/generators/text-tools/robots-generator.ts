import { robotsFile } from '@arablyzer/generators'
import { TEXT_TOOLS_UI } from '@arablyzer/i18n/text-tools'
import type { Block, TextToolSpec } from './spec'

const lines = (text: string) => text.split(/\r?\n/)

/** The robots.txt generator (M10.1): a file from a few choices, with the AI crawlers by their tokens. */
export const spec: TextToolSpec = {
  kind: 'generator',
  fields: (lang) => {
    const t = TEXT_TOOLS_UI[lang].robots
    const choice = [
      { value: 'allow', label: t.allow },
      { value: 'block', label: t.block },
    ]
    return [
      {
        name: 'paths',
        kind: 'textarea',
        rows: 4,
        label: t.paths,
        hint: t.pathsHint,
        dir: 'ltr',
        required: false,
        placeholder: '/admin/\n/cart/',
      },
      { name: 'training', kind: 'select', label: t.training, options: choice },
      { name: 'search', kind: 'select', label: t.search, options: choice },
      {
        name: 'sitemaps',
        kind: 'textarea',
        rows: 2,
        label: t.sitemaps,
        hint: t.sitemapsHint,
        dir: 'ltr',
        required: false,
        placeholder: 'https://example.com/sitemap.xml',
      },
    ]
  },
  submit: (lang) => TEXT_TOOLS_UI[lang].robots.submit,
  run: ({ paths = '', training = 'allow', search = 'allow', sitemaps = '' }, lang) => {
    const t = TEXT_TOOLS_UI[lang].robots
    const result = robotsFile({
      blockPaths: lines(paths),
      training: training === 'block' ? 'block' : 'allow',
      search: search === 'block' ? 'block' : 'allow',
      sitemaps: lines(sitemaps),
    })
    const notes = [
      ...result.problems.map(({ problem, input }) => ({
        tone: 'warn' as const,
        text: t.problems[problem](input),
      })),
      ...(training === 'block' ? [{ tone: 'info' as const, text: t.trainingBlocked }] : []),
      ...(search === 'block' ? [{ tone: 'warn' as const, text: t.searchBlocked }] : []),
      { tone: 'info' as const, text: t.asks },
    ]
    const blocks: Block[] = [
      { kind: 'code', label: t.file, text: result.text },
      { kind: 'notes', items: notes },
    ]
    return { blocks }
  },
}
