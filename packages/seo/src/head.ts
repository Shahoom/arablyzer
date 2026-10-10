import { escapeHtml } from './html'
import { jsonLdScript, type JsonLd } from './json-ld'
import type { Alternate } from './site'

/** What a link preview shows, with the image the site's build draws for the page (§6.5). */
export interface OpenGraph {
  /** "article" for a blog post, with `article`; "website" (the default) for every other page. */
  readonly type?: 'website' | 'article'
  readonly article?: {
    /** YYYY-MM-DD. */
    readonly published: string
    readonly modified: string
    readonly tags: readonly string[]
  }
  readonly title: string
  readonly description: string
  /** None for a page that serves many links, as a report's does: the preview uses the link. */
  readonly url?: string
  readonly image?: {
    readonly url: string
    readonly alt: string
    readonly width: number
    readonly height: number
  }
}

/** A feed a page offers to readers, as `<link rel="alternate" type=…>`. */
export interface FeedLink {
  readonly kind: 'rss' | 'atom'
  readonly title: string
  readonly href: string
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
  readonly feeds?: readonly FeedLink[]
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
    const { title, description, url, article } = options.openGraph
    lines.push(
      `<meta property="og:type" content="${options.openGraph.type ?? 'website'}">`,
      '<meta property="og:site_name" content="Arablyzer">',
      `<meta property="og:title" content="${escapeHtml(title)}">`,
      `<meta property="og:description" content="${escapeHtml(description)}">`,
    )
    if (url !== undefined) lines.push(`<meta property="og:url" content="${escapeHtml(url)}">`)
    if (article !== undefined) {
      lines.push(
        `<meta property="article:published_time" content="${escapeHtml(article.published)}">`,
        `<meta property="article:modified_time" content="${escapeHtml(article.modified)}">`,
        ...article.tags.map((tag) => `<meta property="article:tag" content="${escapeHtml(tag)}">`),
      )
    }
    const { image } = options.openGraph
    if (image !== undefined) {
      lines.push(
        `<meta property="og:image" content="${escapeHtml(image.url)}">`,
        `<meta property="og:image:width" content="${String(image.width)}">`,
        `<meta property="og:image:height" content="${String(image.height)}">`,
        `<meta property="og:image:alt" content="${escapeHtml(image.alt)}">`,
        '<meta name="twitter:card" content="summary_large_image">',
      )
    }
  }
  for (const feed of options.feeds ?? []) {
    const type = feed.kind === 'rss' ? 'application/rss+xml' : 'application/atom+xml'
    lines.push(
      `<link rel="alternate" type="${type}" title="${escapeHtml(feed.title)}" href="${escapeHtml(feed.href)}">`,
    )
  }
  for (const data of options.jsonLd ?? []) lines.push(jsonLdScript(data))
  return lines.join('\n')
}
