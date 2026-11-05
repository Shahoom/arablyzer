import { arabicSlug } from '@arablyzer/generators'
import { TEXT_TOOLS_UI } from '@arablyzer/i18n/text-tools'
import type { Block, TextToolSpec } from './spec'

const MARKS = /[ً-ٰٟـ]/
const EASTERN_DIGITS = /[٠-٩۰-۹]/

/** The Arabic slug generator (M2.3b, M10.1): a title as the last part of an address, as the slug rule passes it. */
export const spec: TextToolSpec = {
  kind: 'generator',
  fields: (lang) => {
    const t = TEXT_TOOLS_UI[lang].slug
    return [
      { name: 'title', kind: 'text', label: t.title, hint: t.titleHint },
      {
        name: 'base',
        kind: 'text',
        label: t.base,
        hint: t.baseHint,
        dir: 'ltr',
        required: false,
        placeholder: 'https://example.com/products/',
      },
    ]
  },
  submit: (lang) => TEXT_TOOLS_UI[lang].slug.submit,
  run: ({ title = '', base = '' }, lang) => {
    const t = TEXT_TOOLS_UI[lang].slug
    const result = arabicSlug(title)
    if (result.slug === '') return { error: t.empty }
    let start = base.trim()
    if (start !== '') {
      try {
        if (!/^https?:$/.test(new URL(start).protocol)) throw new TypeError('scheme')
      } catch {
        return { error: t.badBase }
      }
      if (!start.endsWith('/')) start += '/'
    }
    const blocks: Block[] = [
      { kind: 'code', label: t.slug, text: result.slug },
      { kind: 'code', label: t.encoded, text: result.encoded },
    ]
    if (start !== '') blocks.push({ kind: 'code', label: t.url, text: `${start}${result.encoded}` })
    const notes = [
      ...(MARKS.test(title) ? [{ tone: 'info' as const, text: t.marks }] : []),
      ...(EASTERN_DIGITS.test(title) ? [{ tone: 'info' as const, text: t.digits }] : []),
      ...(result.truncated ? [{ tone: 'warn' as const, text: t.truncated }] : []),
    ]
    blocks.push({
      kind: 'notes',
      items: notes.length > 0 ? notes : [{ tone: 'ok', text: t.clean }],
    })
    return { blocks }
  },
}
