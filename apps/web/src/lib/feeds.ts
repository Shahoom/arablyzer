import { BLOG_UI } from '@arablyzer/i18n'
import type { FeedLink } from '@arablyzer/seo/head'
import { localePath, type Lang, type Site } from '@arablyzer/seo/site'

/** Where a language's feeds are: /blog/feed.xml (RSS) and /blog/atom.xml, /en/blog/… in English. */
export function feedPath(lang: Lang, kind: 'rss' | 'atom'): string {
  return localePath(lang, kind === 'rss' ? '/blog/feed.xml' : '/blog/atom.xml')
}

/** The `<link rel="alternate">` of both feeds, for the blog's pages and the home page. */
export function feedLinks(site: Site, lang: Lang): FeedLink[] {
  const t = BLOG_UI[lang].feeds
  return [
    { kind: 'rss', title: t.rssTitle, href: `${site.origin}${feedPath(lang, 'rss')}` },
    { kind: 'atom', title: t.atomTitle, href: `${site.origin}${feedPath(lang, 'atom')}` },
  ]
}
