import {
  planRedirects,
  redirectConfig,
  type RedirectStatus,
  type RedirectTarget,
} from '@arablyzer/generators'
import { TEXT_TOOLS_UI } from '@arablyzer/i18n/text-tools'
import type { Block, TextField, TextToolResult, TextToolSpec } from './spec'

type Strings = (typeof TEXT_TOOLS_UI)['ar']['redirects']
type Lang = 'ar' | 'en'

function problemsOf(t: Strings, plan: ReturnType<typeof planRedirects>) {
  return plan.problems.slice(0, 30).map(({ line, problem, text }) => ({
    tone: problem === 'chain' || problem === 'duplicate' ? ('info' as const) : ('warn' as const),
    text: t.problems[problem](line, text),
  }))
}

const pairsField = (t: Strings): TextField => ({
  name: 'pairs',
  kind: 'textarea',
  rows: 8,
  label: t.pairs,
  hint: t.pairsHint,
  dir: 'ltr',
  placeholder: '/old-page /new-page\n/قهوة-قديمة /coffee',
})

/** The redirect planner (M10.1): a list of redirects, flattened and checked. */
export const planner: TextToolSpec = {
  kind: 'paste',
  fields: (lang) => [pairsField(TEXT_TOOLS_UI[lang].redirects)],
  submit: (lang) => TEXT_TOOLS_UI[lang].redirects.submit,
  run: ({ pairs = '' }, lang: Lang): TextToolResult => {
    const t = TEXT_TOOLS_UI[lang].redirects
    const plan = planRedirects(pairs)
    if (plan.pairs.length === 0 && plan.problems.length === 0) return { error: t.empty }
    const blocks: Block[] = []
    if (plan.pairs.length > 0) {
      blocks.push({
        kind: 'code',
        label: t.flat,
        text: plan.pairs.map(({ from, to }) => `${from} ${to}`).join('\n'),
      })
    }
    blocks.push({
      kind: 'notes',
      items: [
        {
          tone: plan.pairs.length > 0 ? 'ok' : 'warn',
          text: t.summary(plan.pairs.length, plan.flattened),
        },
        ...problemsOf(t, plan),
      ],
    })
    return { blocks }
  },
}

/** The redirect generator (M10.1): the same list, written as a server's config. */
export const generator: TextToolSpec = {
  kind: 'generator',
  fields: (lang) => {
    const t = TEXT_TOOLS_UI[lang].redirects
    return [
      pairsField(t),
      {
        name: 'target',
        kind: 'select',
        label: t.target,
        options: (Object.keys(t.targets) as RedirectTarget[]).map((value) => ({
          value,
          label: t.targets[value],
        })),
      },
      {
        name: 'status',
        kind: 'select',
        label: t.status,
        options: (Object.keys(t.statuses) as (keyof typeof t.statuses)[]).map((value) => ({
          value,
          label: t.statuses[value],
        })),
      },
      {
        name: 'site',
        kind: 'text',
        label: t.site,
        hint: t.siteHint,
        dir: 'ltr',
        required: false,
        placeholder: 'https://example.com',
      },
    ]
  },
  submit: (lang) => TEXT_TOOLS_UI[lang].redirects.submit,
  run: (
    { pairs = '', target = 'apache', status = '301', site = '' },
    lang: Lang,
  ): TextToolResult => {
    const t = TEXT_TOOLS_UI[lang].redirects
    let origin: string | null = null
    if (site.trim() !== '') {
      try {
        const url = new URL(site.trim())
        if (!/^https?:$/.test(url.protocol)) throw new TypeError('scheme')
        origin = url.origin
      } catch {
        return { error: t.badSite }
      }
    }
    const plan = planRedirects(pairs)
    if (plan.pairs.length === 0) return { error: t.empty }
    const kind = (Object.keys(t.targets).includes(target) ? target : 'apache') as RedirectTarget
    const code = Number(status) as RedirectStatus
    return {
      blocks: [
        {
          kind: 'code',
          label: t.config,
          text: redirectConfig(
            plan.pairs,
            kind,
            [301, 302, 307, 308].includes(code) ? code : 301,
            origin,
          ),
        },
        {
          kind: 'notes',
          items: [{ tone: 'info', text: t.whereTo[kind] }, ...problemsOf(t, plan)],
        },
      ],
    }
  },
}
