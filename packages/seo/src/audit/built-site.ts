import { readdirSync, readFileSync } from 'node:fs'
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

/** Pages search engines must not index: a user's report, and the 404 page. */
export function isNoindexPage(page: string): boolean {
  return isReport(page) || isNotFound(page)
}

/** A tool's page, /tools/<slug>: the tool page template of BUILD-PLAN §6.1 applies whole. */
function isTool(page: string): boolean {
  return /^(?:\/en)?\/tools\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page)
}

/** A rule's page in the library, /rules/<id>: the rule page template of BUILD-PLAN §6.2. */
function isRule(page: string): boolean {
  return /^(?:\/en)?\/rules\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page)
}

/**
 * The pages that stand for the rest, for the checks too slow to run on every page (Lighthouse,
 * the site scanning itself in three engines): every page but the report pages, and of the tool
 * pages and the rule pages only the first in each language, since each is one template.
 */
export function representativePages(pages: readonly BuiltPage[]): BuiltPage[] {
  const first = new Set(
    [isTool, isRule].flatMap((template) =>
      (['ar', 'en'] as const).flatMap((lang) => {
        const page = pages.find((candidate) => candidate.lang === lang && template(candidate.path))
        return page === undefined ? [] : [page.path]
      }),
    ),
  )
  return pages.filter(
    (page) =>
      !isNoindexPage(page.path) &&
      ((!isTool(page.path) && !isRule(page.path)) || first.has(page.path)),
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
  return { pages, problems }
}
