import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { localePath, pageUrl, type Lang, type Site } from '../site'
import { auditBuiltPair, auditReportPage, type ExpectedPage, type PageProblem } from './audit'

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
        const page = file.endsWith('index.html')
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
    if (isReport(page.path)) {
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
    problems.push(
      ...auditBuiltPair(
        { html: html(page), expected: expected('ar') },
        { html: html(english), expected: expected('en') },
      ),
    )
  }
  return { pages, problems }
}
