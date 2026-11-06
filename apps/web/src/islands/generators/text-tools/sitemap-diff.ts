import { diffSitemaps, readSitemap } from '@arablyzer/generators'
import { TEXT_TOOLS_UI } from '@arablyzer/i18n/text-tools'
import type { Block, TextToolSpec } from './spec'

/** At most this many addresses are listed under each heading. */
const SHOWN = 20

/** The sitemap comparer (M10.1): two pasted sitemaps, and what changed between them. */
export const spec: TextToolSpec = {
  kind: 'paste',
  fields: (lang) => {
    const t = TEXT_TOOLS_UI[lang].sitemapDiff
    return [
      { name: 'before', kind: 'textarea', rows: 6, label: t.before, dir: 'ltr' },
      { name: 'after', kind: 'textarea', rows: 6, label: t.after, dir: 'ltr' },
    ]
  },
  submit: (lang) => TEXT_TOOLS_UI[lang].sitemapDiff.submit,
  run: ({ before = '', after = '' }, lang) => {
    const t = TEXT_TOOLS_UI[lang].sitemapDiff
    const old = readSitemap(before)
    const current = readSitemap(after)
    if (old.kind === null) return { error: t.notSitemap(t.before) }
    if (current.kind === null) return { error: t.notSitemap(t.after) }
    const diff = diffSitemaps(old, current)
    const list = (label: string, items: readonly string[]): Block[] =>
      items.length === 0
        ? []
        : [
            {
              kind: 'notes',
              label,
              items: [
                ...items.slice(0, SHOWN).map((text) => ({ tone: 'info' as const, text })),
                ...(items.length > SHOWN
                  ? [{ tone: 'info' as const, text: t.more(items.length - SHOWN) }]
                  : []),
              ],
            },
          ]
    const nothing = diff.added.length + diff.removed.length + diff.changed.length === 0
    return {
      blocks: [
        {
          kind: 'notes',
          items: [
            {
              tone: nothing ? 'ok' : 'info',
              text: nothing
                ? t.same
                : t.summary(
                    diff.added.length,
                    diff.removed.length,
                    diff.changed.length,
                    diff.unchanged,
                  ),
            },
          ],
        },
        ...list(t.added, diff.added),
        ...list(t.removed, diff.removed),
        ...list(
          t.changed,
          diff.changed.map(
            ({ url, before: was, after: now }) => `${url} ${t.dated(was ?? '', now ?? '')}`,
          ),
        ),
      ],
    }
  },
}
