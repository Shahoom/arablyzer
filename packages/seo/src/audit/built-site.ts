import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { localePath, pageUrl, type Lang, type Site } from '../site'
import {
  auditBlogPostPage,
  auditBlogPostPair,
  auditBuiltPair,
  auditPage,
  auditPair,
  auditReportPage,
  auditRulePair,
  type ExpectedPage,
  type PageProblem,
} from './audit'

export interface BuiltPage {
  /** The page's path on the site: "/", "/en/", "/tools/rtl-check". */
  readonly path: string
  /** Its file, relative to the build directory. */
  readonly file: string
  readonly lang: Lang
}

/**
 * The pages a static build wrote, with Astro's `build.format: 'preserve'`: `index.html` is its
 * directory's page and `name.html` is `name`. Astro's own files, under `_astro/`, are not pages.
 */
export function builtPages(dir: string): BuiltPage[] {
  const pages: BuiltPage[] = []
  const walk = (relative: string) => {
    for (const entry of readdirSync(path.join(dir, relative), { withFileTypes: true })) {
      const file = relative === '' ? entry.name : `${relative}/${entry.name}`
      if (entry.isDirectory()) {
        if (entry.name !== '_astro') walk(file)
      } else if (entry.name.endsWith('.html')) {
        // A directory's page is its index.html; tools/noindex.html is /tools/noindex.
        const page =
          entry.name === 'index.html'
            ? `/${file.slice(0, -'index.html'.length)}`
            : `/${file.slice(0, -'.html'.length)}`
        pages.push({ path: page, file, lang: isEnglish(page) ? 'en' : 'ar' })
      }
    }
  }
  walk('')
  return pages.sort((a, b) => a.path.localeCompare(b.path, 'en'))
}

/**
 * The files a build wrote that are not pages (feeds, robots.txt, llms.txt, images), as the paths
 * they are served at: a link to one is a link to something that exists. Astro's own files, under
 * `_astro/`, are not listed.
 */
export function builtFiles(dir: string): string[] {
  const files: string[] = []
  const walk = (relative: string) => {
    for (const entry of readdirSync(path.join(dir, relative), { withFileTypes: true })) {
      const file = relative === '' ? entry.name : `${relative}/${entry.name}`
      if (entry.isDirectory()) {
        if (entry.name !== '_astro') walk(file)
      } else if (!entry.name.endsWith('.html')) files.push(`/${file}`)
    }
  }
  walk('')
  return files
}

function isEnglish(page: string): boolean {
  return page === '/en/' || page.startsWith('/en/')
}

/** The Arabic path of an English one: "/en/" is "/", "/en/tools/x" is "/tools/x". */
function arabicPath(page: string): string {
  return page === '/en/' ? '/' : page.slice('/en'.length)
}

function isReport(page: string): boolean {
  return /^\/(?:en\/)?r(?:\/|$)/.test(page)
}

/** The page for an address that has none, /404 and /en/404: never indexed, like a report. */
function isNotFound(page: string): boolean {
  return /^(?:\/en)?\/404$/.test(page)
}

/** The sign-in, account and comparison pages (M4.1, M4.6): for the person signed in alone, never indexed. */
function isAccountPage(page: string): boolean {
  return /^(?:\/en)?\/(?:login|account(?:\/compare)?)$/.test(page)
}

/** Pages search engines must not index: a user's report, the 404 page, and the account pages. */
export function isNoindexPage(page: string): boolean {
  return isReport(page) || isNotFound(page) || isAccountPage(page)
}

/** A tool's page, /tools/<slug>: the tool page template of BUILD-PLAN §6.1 applies whole. */
function isTool(page: string): boolean {
  return /^(?:\/en)?\/tools\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page)
}

/** A rule's page in the library, /rules/<id>: the rule page template of BUILD-PLAN §6.2. */
function isRule(page: string): boolean {
  return /^(?:\/en)?\/rules\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page)
}

/** A guide's page, /fix/<slug>: one guide template, with a message of Search Console's each. */
function isGuide(page: string): boolean {
  return /^(?:\/en)?\/fix\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page)
}

/** A glossary term's page, /glossary/<slug>: one template, with a term each. */
function isTerm(page: string): boolean {
  return /^(?:\/en)?\/glossary\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page)
}

/** An article of the blog, /blog/<slug>: in Arabic always, in English when it is translated. */
export function isBlogPost(page: string): boolean {
  return /^(?:\/en)?\/blog\/(?!tag$)[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page)
}

/** A tag's page in the blog, /blog/tag/<tag>: in English only for a tag an English article has. */
export function isBlogTag(page: string): boolean {
  return /^(?:\/en)?\/blog\/tag\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page)
}

/** A comparison with another tool, /compare/<slug>. */
function isCompare(page: string): boolean {
  return /^(?:\/en)?\/compare\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page)
}

/**
 * The pages below a directory page that are one template with other words. A directory of such
 * pages that is missing here is measured page by page, as the guides and the glossary were until
 * Lighthouse's CI job timed out on them: add each new one.
 */
const TEMPLATES = [isTool, isRule, isGuide, isTerm, isBlogPost, isBlogTag, isCompare] as const

/**
 * The pages that stand for the rest, for the checks too slow to run on every page (Lighthouse,
 * the site scanning itself in three engines): every page but the report pages, and of the pages
 * that share a template (TEMPLATES) only the first in each language.
 */
export function representativePages(pages: readonly BuiltPage[]): BuiltPage[] {
  const first = new Set(
    TEMPLATES.flatMap((template) =>
      (['ar', 'en'] as const).flatMap((lang) => {
        const page = pages.find((candidate) => candidate.lang === lang && template(candidate.path))
        return page === undefined ? [] : [page.path]
      }),
    ),
  )
  return pages.filter(
    (page) =>
      !isNoindexPage(page.path) &&
      (!TEMPLATES.some((template) => template(page.path)) || first.has(page.path)),
  )
}

export interface BuiltSiteAudit {
  readonly pages: readonly BuiltPage[]
  readonly problems: readonly PageProblem[]
}

/**
 * The CI self-audit on the site Astro built (M2.1 plan §3): every page in both languages, each
 * with its counterpart, and the report page's template.
 */
export function auditBuiltSite(dir: string, site: Site): BuiltSiteAudit {
  const pages = builtPages(dir)
  const problems: PageProblem[] = []
  const known = new Set([...pages.map((page) => page.path), ...builtFiles(dir)])
  const html = (page: BuiltPage) => readFileSync(path.join(dir, page.file), 'utf8')

  for (const page of pages) {
    if (isNoindexPage(page.path)) {
      for (const found of auditReportPage(html(page), page.lang)) {
        problems.push({ page: page.path, ...found })
      }
      continue
    }
    if (page.lang === 'en') {
      if (!known.has(arabicPath(page.path))) {
        problems.push({
          page: page.path,
          check: 'reciprocal',
          message: `no Arabic page ${arabicPath(page.path)}: Arabic is the original (BUILD-PLAN §1)`,
        })
      }
      continue
    }
    const english = pages.find((other) => other.path === localePath('en', page.path))
    // An article and a tag page are in Arabic always, and in English when someone translated them
    // (the blog never pairs a page with a translation that is not there): the rest come in pairs.
    const unpaired = isBlogPost(page.path) || isBlogTag(page.path)
    if (english === undefined && !unpaired) {
      problems.push({
        page: page.path,
        check: 'reciprocal',
        message: `no English page ${localePath('en', page.path)}`,
      })
      continue
    }
    const alternates =
      english === undefined
        ? { ar: pageUrl(site, 'ar', page.path) }
        : { ar: pageUrl(site, 'ar', page.path), en: pageUrl(site, 'en', page.path) }
    const expected = (lang: Lang): ExpectedPage => ({
      lang,
      url: pageUrl(site, lang, page.path),
      alternates,
      origin: site.origin,
      knownPaths: known,
    })
    if (english === undefined) {
      const audit = isBlogPost(page.path) ? auditBlogPostPage : auditPage
      for (const found of audit(html(page), expected('ar'))) {
        problems.push({ page: pageUrl(site, 'ar', page.path), ...found })
      }
      continue
    }
    const pair = isTool(page.path)
      ? auditPair
      : isRule(page.path)
        ? auditRulePair
        : isBlogPost(page.path)
          ? auditBlogPostPair
          : auditBuiltPair
    problems.push(
      ...pair(
        { html: html(page), expected: expected('ar') },
        { html: html(english), expected: expected('en') },
      ),
    )
  }
  problems.push(
    ...sitemapProblems(dir, site, pages),
    ...ogImageProblems(dir, site, pages, html),
    ...siteFileProblems(dir, site, pages),
  )
  return { pages, problems }
}

/**
 * The sitemaps (BUILD-PLAN §6.5) against the pages: an index at /sitemap.xml, and in its
 * sitemaps every page search engines should index, in both languages, and no other address.
 */
function sitemapProblems(dir: string, site: Site, pages: readonly BuiltPage[]): PageProblem[] {
  const problem = (message: string): PageProblem => ({
    page: '/sitemap.xml',
    check: 'sitemap',
    message,
  })
  const read = (url: string): string | null => {
    if (!url.startsWith(`${site.origin}/`)) return null
    const file = path.join(dir, new URL(url).pathname)
    return existsSync(file) ? readFileSync(file, 'utf8') : null
  }
  const locs = (xml: string) =>
    [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? '')
  const index = read(`${site.origin}/sitemap.xml`)
  if (index === null) return [problem('no sitemap index at /sitemap.xml')]
  const listed = new Set<string>()
  const problems: PageProblem[] = []
  for (const sitemap of locs(index)) {
    const xml = read(sitemap)
    if (xml === null) {
      problems.push(problem(`the index names ${sitemap}, which the build did not write`))
      continue
    }
    for (const url of locs(xml)) listed.add(url)
  }
  const indexable = new Set(
    pages.filter((page) => !isNoindexPage(page.path)).map((page) => `${site.origin}${page.path}`),
  )
  for (const url of indexable) {
    if (!listed.has(url)) problems.push(problem(`${url} is in no sitemap`))
  }
  for (const url of listed) {
    if (!indexable.has(url))
      problems.push(problem(`${url} is in a sitemap, but not a page to index`))
  }
  return problems
}

/** Every page shared as a link has its Open Graph image, on the site, where the build drew it. */
function ogImageProblems(
  dir: string,
  site: Site,
  pages: readonly BuiltPage[],
  html: (page: BuiltPage) => string,
): PageProblem[] {
  const problems: PageProblem[] = []
  for (const page of pages) {
    // Neither the 404 page nor the account pages are shared as links.
    if (isNotFound(page.path) || isAccountPage(page.path)) continue
    const image = /<meta property="og:image" content="([^"]+)"/.exec(html(page))?.[1]
    const problem = (message: string) => {
      problems.push({ page: page.path, check: 'og-image', message })
    }
    if (image === undefined) problem('no og:image')
    else if (!image.startsWith(`${site.origin}/`)) problem(`the og:image is off the site: ${image}`)
    else if (!existsSync(path.join(dir, new URL(image).pathname))) {
      problem(`the og:image ${image} is not in the build`)
    }
  }
  return problems
}

/**
 * The files beside the pages: robots.txt names the sitemap and keeps reports open to crawlers (a
 * report is kept out of the index by its noindex, which a crawler can read only if it may fetch
 * the page), llms.txt is a description whose links all exist, and each language's two feeds hold
 * an entry for each of its articles.
 */
function siteFileProblems(dir: string, site: Site, pages: readonly BuiltPage[]): PageProblem[] {
  const problems: PageProblem[] = []
  const read = (file: string): string | null => {
    const full = path.join(dir, file)
    return existsSync(full) ? readFileSync(full, 'utf8') : null
  }
  const problem = (page: string, check: 'robots' | 'llms' | 'feed', message: string) => {
    problems.push({ page, check, message })
  }

  const robots = read('robots.txt')
  if (robots === null) problem('/robots.txt', 'robots', 'no robots.txt')
  else {
    if (!robots.includes(`Sitemap: ${site.origin}/sitemap.xml`)) {
      problem('/robots.txt', 'robots', 'robots.txt does not name the sitemap index')
    }
    for (const rule of robots.split('\n').filter((line) => /^\s*disallow:/i.test(line))) {
      const target = rule.replace(/^\s*disallow:\s*/i, '').trim()
      if (target === '/' || /^(?:\/en)?\/r\//.test(target)) {
        problem(
          '/robots.txt',
          'robots',
          `Disallow: ${target} would keep crawlers from reading the noindex of the pages under it`,
        )
      }
    }
  }

  const llms = read('llms.txt')
  if (llms === null) problem('/llms.txt', 'llms', 'no llms.txt')
  else {
    if (!llms.startsWith('# ') || !/^> .+/m.test(llms)) {
      problem('/llms.txt', 'llms', 'llms.txt starts with a "# name" and a "> summary" line')
    }
    const known = new Set(pages.map((page) => page.path))
    for (const match of llms.matchAll(/\]\((https:\/\/[^)\s]+)\)/g)) {
      const url = new URL(match[1] ?? '')
      if (url.origin !== site.origin) continue
      if (!known.has(url.pathname) && !existsSync(path.join(dir, url.pathname))) {
        problem('/llms.txt', 'llms', `links to ${url.pathname}, which the build did not write`)
      }
    }
  }

  for (const lang of ['ar', 'en'] as const) {
    const prefix = lang === 'en' ? '/en' : ''
    const posts = pages.filter((page) => page.lang === lang && isBlogPost(page.path))
    for (const [file, tag, name] of [
      ['feed.xml', 'item', 'RSS'],
      ['atom.xml', 'entry', 'Atom'],
    ] as const) {
      const feedPath = `${prefix}/blog/${file}`
      const xml = read(feedPath.slice(1))
      if (xml === null) {
        problem(feedPath, 'feed', `no ${name} feed`)
        continue
      }
      const count = (xml.match(new RegExp(`<${tag}>`, 'g')) ?? []).length
      if (count !== posts.length) {
        problem(
          feedPath,
          'feed',
          `the ${name} feed has ${count} entries for ${posts.length} articles`,
        )
      }
      for (const post of posts) {
        if (!xml.includes(`${site.origin}${post.path}`)) {
          problem(feedPath, 'feed', `the ${name} feed does not list ${post.path}`)
        }
      }
    }
  }
  return problems
}
