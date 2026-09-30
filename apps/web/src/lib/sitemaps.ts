import { PATHS } from '@arablyzer/seo/site'
import type { SitemapPage, SitemapSection } from '@arablyzer/seo/sitemap'
import { LIBRARY_DATA } from './rule-data'
import { TOOLS_DATA } from './tool-data'

// What each sitemap lists (M2.4c): every page search engines should index, by section. The
// site's audit checks the sitemaps against the pages the build wrote, both ways.

/** The site's own pages: the home page, the directories, and the pages about the site. */
const PAGES: readonly string[] = [
  PATHS.home,
  PATHS.tools,
  PATHS.rules,
  PATHS.methodology,
  PATHS.bot,
]

export function sitemapPages(section: SitemapSection): SitemapPage[] {
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
  }
}
