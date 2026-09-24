import { escapeHtml } from './html'
import { jsonLdScript, type JsonLd } from './json-ld'
import type { Alternate } from './site'

export interface HeadOptions {
  readonly title: string
  readonly description?: string
  readonly canonical?: string
  readonly alternates?: readonly Alternate[]
  /** A robots meta, such as "noindex, nofollow"; none means indexable. */
  readonly robots?: string
  readonly jsonLd?: readonly JsonLd[]
}

/** The contents of <head>, one element per line. */
export function renderHead(options: HeadOptions): string {
  const lines = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(options.title)}</title>`,
  ]
  if (options.description !== undefined) {
    lines.push(`<meta name="description" content="${escapeHtml(options.description)}">`)
  }
  if (options.robots !== undefined) {
    lines.push(`<meta name="robots" content="${escapeHtml(options.robots)}">`)
  }
  if (options.canonical !== undefined) {
    lines.push(`<link rel="canonical" href="${escapeHtml(options.canonical)}">`)
  }
  for (const alternate of options.alternates ?? []) {
    lines.push(
      `<link rel="alternate" hreflang="${alternate.hreflang}" href="${escapeHtml(alternate.href)}">`,
    )
  }
  for (const data of options.jsonLd ?? []) lines.push(jsonLdScript(data))
  return lines.join('\n')
}
