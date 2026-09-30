import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { auditBuiltSite, builtPages, representativePages } from '../src/audit/index'
import { renderHead } from '../src/head'
import { alternates, localePath, pageUrl, PREVIEW_SITE, type Lang } from '../src/site'

const SITE = PREVIEW_SITE
const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A build directory with these files. */
function build(files: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'arablyzer-site-'))
  dirs.push(dir)
  for (const [file, html] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), html)
  }
  return dir
}

const TEXT: Readonly<Record<Lang, { title: string; body: string }>> = {
  ar: {
    title: 'أدوات فحص المواقع العربية',
    body: 'يفحص هذا الموقع الصفحات العربية في ثلاثة متصفحات.',
  },
  en: { title: 'Arabic website checks', body: 'This site checks Arabic pages in three browsers.' },
}

/** A page as the site's layout writes it: its head from renderHead, one heading, some text. */
function page(lang: Lang, pagePath: string, options: { body?: string; robots?: string } = {}) {
  const url = pageUrl(SITE, lang, pagePath)
  const { title, body } = TEXT[lang]
  const head = renderHead({
    title,
    description: body,
    canonical: url,
    alternates: alternates(SITE, pagePath),
    openGraph: { title, description: body, url },
    ...(options.robots === undefined ? {} : { robots: options.robots }),
  })
  return `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head>${head}</head><body><main><h1>${title}</h1><p>${body}</p>${options.body ?? ''}</main></body></html>`
}

const home = (lang: Lang, options?: { body?: string; robots?: string }) => page(lang, '/', options)

describe('builtPages', () => {
  it('reads the paths Astro gives files with build.format preserve, without its assets', () => {
    const dir = build({
      'index.html': home('ar'),
      'en/index.html': home('en'),
      'tools/rtl-check.html': page('ar', '/tools/rtl-check'),
      'tools/noindex.html': page('ar', '/tools/noindex'),
      '_astro/chunk.html': '<p>not a page</p>',
    })
    expect(builtPages(dir)).toEqual([
      { path: '/', file: 'index.html', lang: 'ar' },
      { path: '/en/', file: 'en/index.html', lang: 'en' },
      { path: '/tools/noindex', file: 'tools/noindex.html', lang: 'ar' },
      { path: '/tools/rtl-check', file: 'tools/rtl-check.html', lang: 'ar' },
    ])
  })
})

describe('representativePages', () => {
  it('keeps every page but the tool and rule pages past the first in each language, the reports and the 404 page', () => {
    const dir = build({
      'index.html': home('ar'),
      'en/index.html': home('en'),
      'tools.html': page('ar', '/tools'),
      'tools/a-check.html': page('ar', '/tools/a-check'),
      'tools/b-check.html': page('ar', '/tools/b-check'),
      'en/tools/a-check.html': page('en', '/tools/a-check'),
      'en/tools/b-check.html': page('en', '/tools/b-check'),
      'r/index.html': '<!doctype html><title>تقرير</title>',
      'rules/a-rule.html': page('ar', '/rules/a-rule'),
      'rules/b-rule.html': page('ar', '/rules/b-rule'),
      'en/rules/a-rule.html': page('en', '/rules/a-rule'),
      '404.html': '<!doctype html><title>404</title>',
    })
    expect(representativePages(builtPages(dir)).map((built) => built.path)).toEqual([
      '/',
      '/en/',
      '/en/rules/a-rule',
      '/en/tools/a-check',
      '/rules/a-rule',
      '/tools',
      '/tools/a-check',
    ])
  })
})

describe('auditBuiltSite', () => {
  it('passes a site whose pages come in both languages and link to each other', () => {
    const link = (lang: Lang) =>
      `<p><a href="${localePath(lang === 'ar' ? 'en' : 'ar', '/')}">${lang === 'ar' ? 'English' : 'العربية'}</a></p>`
    const dir = build({
      'index.html': home('ar', { body: link('ar') }),
      'en/index.html': home('en', { body: link('en') }),
    })
    expect(auditBuiltSite(dir, SITE)).toEqual({
      pages: [
        { path: '/', file: 'index.html', lang: 'ar' },
        { path: '/en/', file: 'en/index.html', lang: 'en' },
      ],
      problems: [],
    })
  })

  it('wants every page in both languages, Arabic first', () => {
    const missingEnglish = build({ 'index.html': home('ar') })
    expect(auditBuiltSite(missingEnglish, SITE).problems).toEqual([
      { page: '/', check: 'reciprocal', message: 'no English page /en/' },
    ])
    const missingArabic = build({
      'index.html': home('ar'),
      'en/index.html': home('en'),
      'en/about.html': page('en', '/about'),
    })
    expect(auditBuiltSite(missingArabic, SITE).problems.map((problem) => problem.check)).toEqual([
      'reciprocal',
    ])
  })

  it('finds a link to a page the site did not build', () => {
    const dir = build({
      'index.html': home('ar', { body: '<a href="/tools">الأدوات</a>' }),
      'en/index.html': home('en'),
    })
    expect(auditBuiltSite(dir, SITE).problems).toEqual([
      {
        page: `${SITE.origin}/`,
        check: 'links',
        message: 'no such page on the site: /tools',
      },
    ])
  })

  it('keeps the site indexable', () => {
    const dir = build({
      'index.html': home('ar', { robots: 'noindex' }),
      'en/index.html': home('en'),
    })
    expect(auditBuiltSite(dir, SITE).problems.map((problem) => problem.check)).toContain(
      'indexable',
    )
  })

  it('keeps the 404 pages out of search engines, without a canonical', () => {
    const notFound = (lang: Lang, robots: string) =>
      `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><title>404</title>${robots}</head><body><h1>404</h1></body></html>`
    const noindex = '<meta name="robots" content="noindex, nofollow">'
    const right = build({
      'index.html': home('ar'),
      'en/index.html': home('en'),
      '404.html': notFound('ar', noindex),
      'en/404.html': notFound('en', noindex),
    })
    expect(auditBuiltSite(right, SITE).problems).toEqual([])
    const wrong = build({
      'index.html': home('ar'),
      'en/index.html': home('en'),
      '404.html': notFound('ar', ''),
      'en/404.html': notFound('en', noindex),
    })
    expect(auditBuiltSite(wrong, SITE).problems.map((problem) => problem.page)).toEqual(['/404'])
  })

  it('keeps the report page out of search engines', () => {
    const dir = build({
      'index.html': home('ar'),
      'en/index.html': home('en'),
      'r/index.html':
        '<!doctype html><html lang="ar" dir="rtl"><head><title>تقرير</title></head><body></body></html>',
    })
    expect(auditBuiltSite(dir, SITE).problems).toEqual([
      {
        page: '/r/',
        check: 'noindex',
        message:
          'a page kept out of search engines needs <meta name="robots" content="noindex"> in <head>',
      },
    ])
  })

  it('holds a tool page, /tools/<slug>, to the whole tool page template of §6.1', () => {
    // A page any other page may be, which a tool page may not: no form, no sections.
    const dir = build({
      'index.html': home('ar'),
      'en/index.html': home('en'),
      'tools/rtl-check.html': page('ar', '/tools/rtl-check'),
      'en/tools/rtl-check.html': page('en', '/tools/rtl-check'),
    })
    const checks = auditBuiltSite(dir, SITE)
      .problems.filter((problem) => problem.page.endsWith('/tools/rtl-check'))
      .map((problem) => problem.check)
    expect(checks).toEqual(expect.arrayContaining(['tool-first', 'sections', 'json-ld']))
  })
})
