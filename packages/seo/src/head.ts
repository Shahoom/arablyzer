import { escapeHtml } from './html'
import { jsonLdScript, type JsonLd } from './json-ld'
import type { Alternate } from './site'

/** What a link preview shows. The image comes with the site build (BUILD-PLAN §6.5). */
export interface OpenGraph {
  readonly title: string
  readonly description: string
  readonly url: string
}

export interface HeadOptions {
  readonly title: string
  readonly description?: string
  readonly canonical?: string
  readonly alternates?: readonly Alternate[]
  /** A robots meta, such as "noindex, nofollow"; none means indexable. */
  readonly robots?: string
  readonly jsonLd?: readonly JsonLd[]
  readonly openGraph?: OpenGraph
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
  if (options.openGraph !== undefined) {
    const { title, description, url } = options.openGraph
    lines.push(
      '<meta property="og:type" content="website">',
      '<meta property="og:site_name" content="Arablyzer">',
      `<meta property="og:title" content="${escapeHtml(title)}">`,
      `<meta property="og:description" content="${escapeHtml(description)}">`,
      `<meta property="og:url" content="${escapeHtml(url)}">`,
    )
  }
  for (const data of options.jsonLd ?? []) lines.push(jsonLdScript(data))
  return lines.join('\n')
}
