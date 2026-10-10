import { VERSUS_SLUGS, VERSUS_UI } from '@arablyzer/i18n'
import { llmsTxt } from '@arablyzer/seo/llms'
import { pageUrl, PATHS } from '@arablyzer/seo/site'
import type { APIRoute } from 'astro'
import { postsIn } from '../lib/blog'
import { GUIDES_DATA } from '../lib/guide-data'
import { LIBRARY_DATA } from '../lib/rule-data'
import { METHODOLOGY_SOURCE, REPOSITORY, siteOf } from '../lib/site'
import { TOOLS_DATA } from '../lib/tool-data'

// llms.txt (M6): what the site is and where its pages are, for the language models that read it.
// Brief and factual: the counts come from the registries the pages are built from, and every link
// is a page this build writes (the site audit checks them).
export const GET: APIRoute = async ({ site: origin }) => {
  const site = siteOf(origin)
  const at = (path: string, lang: 'ar' | 'en' = 'ar') => pageUrl(site, lang, path)
  const tools = TOOLS_DATA.tools.length
  const rules = LIBRARY_DATA.rules.length
  const text = llmsTxt({
    name: 'Arablyzer',
    summary:
      'Arablyzer is a free, open-source analyzer for Arabic websites: it checks what Arabic-speaking visitors, search engines and AI assistants actually see.',
    details: [
      `It runs ${tools} single-page tools and ${rules} documented rules. A page is drawn in Chromium, Firefox and WebKit, and the findings cover Arabic text (joined letters, fonts, digits, direction), indexing, speed, structured data and AI crawler access.`,
      'Pages are in Arabic (the original, at the root) and in English (under /en/). Single-page tools are free and need no sign-up. A scan report is private to whoever has its link and is not indexed. The code is open source under AGPL-3.0.',
    ],
    sections: [
      {
        title: 'Start here',
        links: [
          {
            title: 'Tools',
            url: at(PATHS.tools),
            note: `${tools} free tools, each checks one thing`,
          },
          {
            title: 'Rule library',
            url: at(PATHS.rules),
            note: `${rules} rules: why it matters, how to fix it, how it is detected`,
          },
          {
            title: 'Fix guides',
            url: at(PATHS.fix),
            note: `${GUIDES_DATA.fix.length} guides for Google Search Console messages`,
          },
          {
            title: 'Glossary',
            url: at(PATHS.glossary),
            note: `${GUIDES_DATA.glossary.length} terms, defined`,
          },
          {
            title: 'Methodology',
            url: at(PATHS.methodology),
            note: `how scores and findings are made; source: ${METHODOLOGY_SOURCE}`,
          },
          {
            title: 'ArablyzerBot',
            url: at(PATHS.bot),
            note: "the scanner's user agent and how to block it",
          },
        ],
      },
      {
        title: 'Articles (Arabic)',
        links: (await postsIn('ar')).map((post) => ({
          title: post.title,
          url: at(PATHS.post(post.slug)),
          note: post.description,
        })),
      },
      {
        title: 'Articles (English)',
        links: (await postsIn('en')).map((post) => ({
          title: post.title,
          url: at(PATHS.post(post.slug), 'en'),
          note: post.description,
        })),
      },
      {
        title: 'Comparisons',
        links: VERSUS_SLUGS.map((slug) => ({
          title: VERSUS_UI.en.hub.row(VERSUS_UI.en.pages[slug].name),
          url: at(PATHS.versus(slug), 'en'),
          note: VERSUS_UI.en.pages[slug].tagline,
        })),
      },
      {
        title: 'Feeds and sitemaps',
        links: [
          { title: 'RSS (Arabic)', url: `${site.origin}/blog/feed.xml` },
          { title: 'Atom (Arabic)', url: `${site.origin}/blog/atom.xml` },
          { title: 'RSS (English)', url: `${site.origin}/en/blog/feed.xml` },
          { title: 'Sitemap index', url: `${site.origin}/sitemap.xml` },
          { title: 'Source code', url: REPOSITORY },
        ],
      },
    ],
  })
  return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
