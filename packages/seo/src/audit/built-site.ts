import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { localePath, pageUrl, type Lang, type Site } from '../site'
import {
  auditBuiltPair,
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

/** The sign-in and account pages (M4.1): for the person signed in alone, never indexed. */
function isAccountPage(page: string): boolean {
  return /^(?:\/en)?\/(?:login|account)$/.test(page)
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

/**
 * The pages below a directory page that are one template with other words. A directory of such
 * pages that is missing here is measured page by page, as the guides and the glossary were until
 * Lighthouse's CI job timed out on them: add each new one.
 */
const TEMPLATES = [isTool, isRule, isGuide, isTerm] as const

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
  const known = new Set(pages.map((page) => page.path))
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
    if (english === undefined) {
      problems.push({
        page: page.path,
        check: 'reciprocal',
        message: `no English page ${localePath('en', page.path)}`,
      })
      continue
    }
    const alternates = { ar: pageUrl(site, 'ar', page.path), en: pageUrl(site, 'en', page.path) }
    const expected = (lang: Lang): ExpectedPage => ({
      lang,
      url: alternates[lang],
      alternates,
      origin: site.origin,
      knownPaths: known,
    })
    const pair = isTool(page.path) ? auditPair : isRule(page.path) ? auditRulePair : auditBuiltPair
    problems.push(
      ...pair(
        { html: html(page), expected: expected('ar') },
        { html: html(english), expected: expected('en') },
      ),
    )
  }
  problems.push(...sitemapProblems(dir, site, pages), ...ogImageProblems(dir, site, pages, html))
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
