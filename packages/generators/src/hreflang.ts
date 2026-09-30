import { checkHreflang, type HreflangCheck } from '@arablyzer/rules/hreflang'
import { escapeHtml } from './html'

// The hreflang generator (M2.3b): the tags each version of a page carries, the same set on
// every version, each code one Google supports (the hreflang-invalid-code rule's check).

export interface HreflangRow {
  readonly href: string
  /** A language, then an optional script and region: ar, ar-SA, en-GB. */
  readonly code: string
}

export interface HreflangResult {
  readonly html: string
  /** A row whose code Google does not support, with a correction when it is mechanical. */
  readonly problems: readonly { readonly row: number; readonly check: HreflangCheck }[]
}

export function hreflangTags(rows: readonly HreflangRow[], xDefault?: string): HreflangResult {
  const problems = rows.flatMap((row, index) => {
    const check = checkHreflang(row.code)
    return check === null ? [] : [{ row: index, check }]
  })
  const tag = (code: string, href: string) =>
    `<link rel="alternate" hreflang="${escapeHtml(code)}" href="${escapeHtml(href)}">`
  const lines = rows.map((row) => tag(row.code.trim(), row.href.trim()))
  if (xDefault !== undefined && xDefault.trim() !== '')
    lines.push(tag('x-default', xDefault.trim()))
  return { html: lines.join('\n'), problems }
}
