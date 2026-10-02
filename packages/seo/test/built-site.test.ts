import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { auditBuiltSite, builtPages, isNoindexPage, representativePages } from '../src/audit/index'
import { renderHead } from '../src/head'
import { alternates, localePath, pageUrl, PREVIEW_SITE, type Lang } from '../src/site'
import { ogImagePath } from '../src/sitemap'

const SITE = PREVIEW_SITE
const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/**
 * A build directory with these files, and what the site's build adds to them: the sitemaps of
 * the pages to index, and the Open Graph image each page names. `discovery: false` leaves both out.
 */
function build(
  files: Readonly<Record<string, string>>,
  { discovery = true }: { discovery?: boolean } = {},
): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'arablyzer-site-'))
  dirs.push(dir)
  const write = (file: string, content: string) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), content)
  }
  for (const [file, html] of Object.entries(files)) write(file, html)
  if (!discovery) return dir
  const pages = builtPages(dir)
  const urls = pages
    .filter((built) => !isNoindexPage(built.path))
    .map((built) => `<url><loc>${SITE.origin}${built.path}</loc></url>`)
  write(
    'sitemap.xml',
    `<sitemapindex><sitemap><loc>${SITE.origin}/sitemaps/pages.xml</loc></sitemap></sitemapindex>`,
  )
  write('sitemaps/pages.xml', `<urlset>${urls.join('')}</urlset>`)
  for (const html of Object.values(files)) {
    const image = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1]
    if (image?.startsWith(`${SITE.origin}/`) === true) write(new URL(image).pathname, 'png')
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
    openGraph: {
      title,
      description: body,
      url,
      image: {
        url: `${SITE.origin}${ogImagePath(localePath(lang, pagePath))}`,
        alt: title,
        width: 1200,
        height: 630,
      },
    },
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
  it('keeps every page but those past the first of a template in each language, the reports and the 404 page', () => {
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

  // M2.4d added the guides and the glossary, and Lighthouse's job, which measured each of their
  // pages six times, ran past its time limit: a directory of one template is one page to measure.
  it('keeps the first guide and the first glossary term in each language, and the directory pages', () => {
    const files: Record<string, string> = {
      'index.html': home('ar'),
      'en/index.html': home('en'),
      'fix.html': page('ar', '/fix'),
      'en/fix.html': page('en', '/fix'),
      'glossary.html': page('ar', '/glossary'),
      'en/glossary.html': page('en', '/glossary'),
      'methodology.html': page('ar', '/methodology'),
    }
    for (const slug of ['a-guide', 'b-guide', 'c-guide-404']) {
      files[`fix/${slug}.html`] = page('ar', `/fix/${slug}`)
      files[`en/fix/${slug}.html`] = page('en', `/fix/${slug}`)
    }
    for (const slug of ['a-term', 'b-term', 'c-term']) {
      files[`glossary/${slug}.html`] = page('ar', `/glossary/${slug}`)
      files[`en/glossary/${slug}.html`] = page('en', `/glossary/${slug}`)
    }
    expect(representativePages(builtPages(build(files))).map((built) => built.path)).toEqual([
      '/',
      '/en/',
      '/en/fix',
      '/en/fix/a-guide',
      '/en/glossary',
      '/en/glossary/a-term',
      '/fix',
      '/fix/a-guide',
      '/glossary',
      '/glossary/a-term',
      '/methodology',
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
        '<!doctype html><html lang="ar" dir="rtl"><head><title>تقرير</title><meta property="og:image" content="https://arablyzer.example/og/r/index.png"></head><body></body></html>',
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

describe('auditBuiltSite on the sitemaps and the Open Graph images', () => {
  const pair = { 'index.html': home('ar'), 'en/index.html': home('en') }

  it('wants a sitemap index, and every page to index in its sitemaps', () => {
    expect(auditBuiltSite(build(pair, { discovery: false }), SITE).problems).toContainEqual({
      page: '/sitemap.xml',
      check: 'sitemap',
      message: 'no sitemap index at /sitemap.xml',
    })
    const dir = build({
      ...pair,
      'tools.html': page('ar', '/tools'),
      'en/tools.html': page('en', '/tools'),
    })
    writeFileSync(
      path.join(dir, 'sitemaps/pages.xml'),
      `<urlset><url><loc>${SITE.origin}/</loc></url><url><loc>${SITE.origin}/en/</loc></url><url><loc>${SITE.origin}/gone</loc></url></urlset>`,
    )
    expect(
      auditBuiltSite(dir, SITE)
        .problems.filter((problem) => problem.check === 'sitemap')
        .map((problem) => problem.message),
    ).toEqual([
      'https://arablyzer.example/en/tools is in no sitemap',
      'https://arablyzer.example/tools is in no sitemap',
      'https://arablyzer.example/gone is in a sitemap, but not a page to index',
    ])
  })

  it('wants the Open Graph image each page names, drawn into the build', () => {
    const dir = build(pair)
    rmSync(path.join(dir, 'og/en/index.png'))
    expect(auditBuiltSite(dir, SITE).problems).toEqual([
      {
        page: '/en/',
        check: 'og-image',
        message: 'the og:image https://arablyzer.example/og/en/index.png is not in the build',
      },
    ])
  })
})
