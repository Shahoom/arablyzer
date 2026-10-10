import { BLOG_UI } from '@arablyzer/i18n'
import type { Feed } from '@arablyzer/seo/feed'
import { pageUrl, PATHS, type Lang, type Site } from '@arablyzer/seo/site'
import { postsIn } from './blog'
import { feedPath } from './feeds'

/** A language's feed: its articles, newest first, as the blog's page lists them. */
export async function blogFeed(site: Site, lang: Lang, kind: 'rss' | 'atom'): Promise<Feed> {
  const t = BLOG_UI[lang]
  return {
    title: kind === 'rss' ? t.feeds.rssTitle : t.feeds.atomTitle,
    description: t.meta.description,
    lang,
    siteUrl: pageUrl(site, lang, PATHS.blog),
    feedUrl: `${site.origin}${feedPath(lang, kind)}`,
    entries: (await postsIn(lang)).map((post) => ({
      title: post.title,
      url: pageUrl(site, lang, PATHS.post(post.slug)),
      summary: post.description,
      published: post.date,
      updated: post.lastmod,
      tags: post.tags.map((tag) => t.tags[tag].name),
      author: post.author,
    })),
  }
}
