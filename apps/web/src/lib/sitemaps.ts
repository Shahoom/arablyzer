import { VERSUS_SLUGS, VERSUS_UI } from '@arablyzer/i18n'
import { PATHS, type Lang } from '@arablyzer/seo/site'
import type { SitemapPage, SitemapSection } from '@arablyzer/seo/sitemap'
import { allPosts, postsIn, tagsIn, type Post } from './blog'
import { GUIDES_DATA } from './guide-data'
import { LIBRARY_DATA } from './rule-data'
import { TOOLS_DATA } from './tool-data'

// What each sitemap lists (M2.4c): every page search engines should index, by section. The
// site's audit checks the sitemaps against the pages the build wrote, both ways.

/** The site's own pages: the home page, the directories, and the pages about the site. */
const PAGES: readonly string[] = [
  PATHS.home,
  PATHS.tools,
  PATHS.knowledge,
  PATHS.rules,
  PATHS.fix,
  PATHS.glossary,
  PATHS.methodology,
  PATHS.bot,
]

export async function sitemapPages(section: SitemapSection): Promise<SitemapPage[]> {
  switch (section) {
    case 'pages':
      return PAGES.map((path) => ({ path }))
    case 'tools':
      return TOOLS_DATA.tools.map((tool) => ({
        path: PATHS.tool(tool.slug),
        lastmod: tool.updated,
      }))
    case 'rules':
      return LIBRARY_DATA.rules.map((rule) => ({ path: PATHS.rule(rule.id) }))
    case 'fix':
      return GUIDES_DATA.fix.map((guide) => ({
        path: PATHS.fixGuide(guide.slug),
        lastmod: guide.updated,
      }))
    case 'glossary':
      return GUIDES_DATA.glossary.map((term) => ({
        path: PATHS.term(term.slug),
        lastmod: term.updated,
      }))
    case 'blog':
      return blogPages()
    case 'compare':
      return [
        { path: PATHS.comparisons },
        ...VERSUS_SLUGS.map((slug) => ({
          path: PATHS.versus(slug),
          lastmod: VERSUS_UI.ar.pages[slug].checked,
        })),
      ]
  }
}

const newest = (posts: readonly Post[]) =>
  posts
    .map((post) => post.lastmod)
    .sort()
    .at(-1)

/**
 * The blog: its index, each Arabic article (in English too only where it is translated, with the
 * date of the later of the two), and each tag page. The dates are the articles' own: a page is
 * as new as the last article it lists.
 */
async function blogPages(): Promise<SitemapPage[]> {
  const posts = await allPosts()
  const arabic = await postsIn('ar')
  const english = new Set((await postsIn('en')).map((post) => post.slug))
  const englishTags = new Set((await tagsIn('en')).map(({ tag }) => tag))
  const pages: SitemapPage[] = [{ path: PATHS.blog, lastmod: newest(posts) }]
  for (const post of arabic) {
    const twin = posts.find((one) => one.lang === 'en' && one.slug === post.slug)
    const langs: readonly Lang[] = english.has(post.slug) ? ['ar', 'en'] : ['ar']
    pages.push({
      path: PATHS.post(post.slug),
      lastmod: newest(twin === undefined ? [post] : [post, twin]),
      langs,
    })
  }
  for (const { tag } of await tagsIn('ar')) {
    const tagged = posts.filter((post) => post.tags.includes(tag))
    pages.push({
      path: PATHS.blogTag(tag),
      lastmod: newest(tagged),
      langs: englishTags.has(tag) ? ['ar', 'en'] : ['ar'],
    })
  }
  return pages
}
