import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  auditBuiltSite,
  builtPages,
  isBlogPost,
  isNoindexPage,
  representativePages,
} from '../src/audit/index'
import { renderHead } from '../src/head'
import { blogPosting, breadcrumbList } from '../src/json-ld'
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
  // The files beside the pages: robots.txt, llms.txt, and the blog's feeds (one entry for each
  // article the fixture has, in each language).
  write('robots.txt', `User-agent: *\nDisallow: /api/\n\nSitemap: ${SITE.origin}/sitemap.xml\n`)
  write('llms.txt', `# Arablyzer\n\n> A fixture site.\n\n- [Home](${SITE.origin}/)\n`)
  for (const lang of ['ar', 'en'] as const) {
    const posts = pages.filter((built) => built.lang === lang && isBlogPost(built.path))
    const prefix = lang === 'en' ? '/en' : ''
    const list = (tag: string) =>
      posts.map((built) => `<${tag}><link>${SITE.origin}${built.path}</link></${tag}>`).join('')
    write(`${prefix}/blog/feed.xml`.slice(1), `<rss><channel>${list('item')}</channel></rss>`)
    write(`${prefix}/blog/atom.xml`.slice(1), `<feed>${list('entry')}</feed>`)
  }
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

  it('keeps the sign-in and account pages out of search engines and the sitemaps, and out of the pages that stand for the rest', () => {
    const noindex = '<meta name="robots" content="noindex, nofollow">'
    const page = (lang: Lang, title: string, robots: string) =>
      `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><title>${title}</title>${robots}</head><body><h1>${title}</h1></body></html>`
    const files = {
      'index.html': home('ar'),
      'en/index.html': home('en'),
      'login.html': page('ar', 'Login', noindex),
      'en/login.html': page('en', 'Login', noindex),
      'account.html': page('ar', 'Account', noindex),
      'en/account.html': page('en', 'Account', noindex),
      'account/compare.html': page('ar', 'Compare', noindex),
      'en/account/compare.html': page('en', 'Compare', noindex),
    }
    const dir = build(files)
    for (const path of [
      '/login',
      '/en/login',
      '/account',
      '/en/account',
      '/account/compare',
      '/en/account/compare',
    ]) {
      expect(isNoindexPage(path), path).toBe(true)
    }
    expect(isNoindexPage('/login-help')).toBe(false)
    expect(auditBuiltSite(dir, SITE).problems).toEqual([])
    expect(representativePages(builtPages(dir)).map((built) => built.path)).toEqual(['/', '/en/'])
    const indexed = build({ ...files, 'login.html': page('ar', 'Login', '') })
    expect(auditBuiltSite(indexed, SITE).problems.map((problem) => problem.page)).toEqual([
      '/login',
    ])
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

describe('auditBuiltSite on the blog', () => {
  const pair = { 'index.html': home('ar'), 'en/index.html': home('en') }

  /** An article as the site writes one: its head, a BlogPosting, a trail, a date. */
  function post(
    lang: Lang,
    slug: string,
    options: { translated?: boolean; posting?: boolean; langs?: readonly Lang[] } = {},
  ) {
    const { translated = false, posting = true } = options
    const articlePath = `/blog/${slug}`
    const url = pageUrl(SITE, lang, articlePath)
    const { title, body } = TEXT[lang]
    const head = renderHead({
      title,
      description: body,
      canonical: url,
      alternates: alternates(
        SITE,
        articlePath,
        options.langs ?? (translated ? ['ar', 'en'] : ['ar']),
      ),
      jsonLd: [
        ...(posting
          ? [
              blogPosting({
                headline: title,
                description: body,
                url,
                origin: SITE.origin,
                lang,
                published: '2026-10-10',
                modified: '2026-10-10',
                author: 'Arablyzer',
                image: `${SITE.origin}${ogImagePath(localePath(lang, articlePath))}`,
                keywords: ['k'],
                wordCount: 1000,
              }),
            ]
          : []),
        breadcrumbList([
          { name: 'Home', url: pageUrl(SITE, lang, '/') },
          { name: 'Blog', url: pageUrl(SITE, lang, '/blog') },
          { name: title, url },
        ]),
      ],
      openGraph: {
        type: 'article',
        title,
        description: body,
        url,
        article: { published: '2026-10-10', modified: '2026-10-10', tags: [] },
        image: {
          url: `${SITE.origin}${ogImagePath(localePath(lang, articlePath))}`,
          alt: title,
          width: 1200,
          height: 630,
        },
      },
    })
    return `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head>${head}</head><body><main><h1>${title}</h1><p>${body}</p><p><time datetime="2026-10-10">10 October 2026</time></p></main></body></html>`
  }

  const problemsOf = (dir: string) =>
    auditBuiltSite(dir, SITE).problems.map((problem) => `${problem.check}: ${problem.message}`)

  it('lets an article stand alone in Arabic, naming itself and an x-default and nothing else', () => {
    const dir = build({
      ...pair,
      'blog/only-arabic.html': post('ar', 'only-arabic'),
      'blog/both.html': post('ar', 'both', { translated: true }),
      'en/blog/both.html': post('en', 'both', { translated: true }),
    })
    expect(problemsOf(dir)).toEqual([])
  })

  it('refuses an article that names a translation that is not there', () => {
    const dir = build({
      ...pair,
      'blog/promises.html': post('ar', 'promises', { translated: true }),
    })
    expect(problemsOf(dir).join('\n')).toMatch(/hreflang: unexpected hreflang="en"/)
  })

  it('refuses an English article that has no Arabic original', () => {
    const dir = build({
      ...pair,
      'en/blog/orphan.html': post('en', 'orphan', { langs: ['en'] }),
    })
    expect(problemsOf(dir).join('\n')).toMatch(/no Arabic page \/blog\/orphan/)
  })

  it('refuses an article that hides its language when it has no translation', () => {
    const dir = build({
      ...pair,
      'blog/lonely.html': post('ar', 'lonely', { translated: false }).replace(
        '</head>',
        `<link rel="alternate" hreflang="en" href="${SITE.origin}/en/blog/lonely"></head>`,
      ),
    })
    expect(problemsOf(dir).join('\n')).toMatch(/hreflang: unexpected hreflang="en"/)
  })

  it('wants a BlogPosting in an article', () => {
    const dir = build({ ...pair, 'blog/plain.html': post('ar', 'plain', { posting: false }) })
    expect(problemsOf(dir).join('\n')).toMatch(/json-ld: needs one BlogPosting, found 0/)
  })

  it('wants robots.txt to name the sitemap and to leave reports open to be read', () => {
    const dir = build(pair)
    writeFileSync(path.join(dir, 'robots.txt'), 'User-agent: *\nDisallow: /r/\n')
    const problems = problemsOf(dir).join('\n')
    expect(problems).toMatch(/robots: robots.txt does not name the sitemap index/)
    expect(problems).toMatch(/Disallow: \/r\/ would keep crawlers from reading the noindex/)
    rmSync(path.join(dir, 'robots.txt'))
    expect(problemsOf(dir).join('\n')).toMatch(/robots: no robots.txt/)
  })

  it('wants an llms.txt whose links all exist, and a feed entry for each article', () => {
    const dir = build({ ...pair, 'blog/a.html': post('ar', 'a') })
    expect(problemsOf(dir)).toEqual([])
    writeFileSync(
      path.join(dir, 'llms.txt'),
      `# Arablyzer\n\n> Summary.\n\n- [Gone](${SITE.origin}/blog/gone)\n- [Here](${SITE.origin}/blog/feed.xml)\n`,
    )
    writeFileSync(path.join(dir, 'blog/feed.xml'), '<rss><channel></channel></rss>')
    rmSync(path.join(dir, 'en/blog/atom.xml'))
    const problems = problemsOf(dir).join('\n')
    expect(problems).toMatch(/llms: links to \/blog\/gone, which the build did not write/)
    expect(problems).not.toMatch(/\/blog\/feed\.xml, which/)
    expect(problems).toMatch(/feed: the RSS feed has 0 entries for 1 articles/)
    expect(problems).toMatch(/feed: no Atom feed/)
  })

  it('counts the blog’s pages as templates: only the first of each is measured', () => {
    const dir = build({
      ...pair,
      'blog.html': page('ar', '/blog'),
      'blog/a.html': post('ar', 'a'),
      'blog/b.html': post('ar', 'b'),
      'blog/tag/x.html': page('ar', '/blog/tag/x'),
      'blog/tag/y.html': page('ar', '/blog/tag/y'),
      'compare.html': page('ar', '/compare'),
      'compare/one.html': page('ar', '/compare/one'),
      'compare/two.html': page('ar', '/compare/two'),
    })
    expect(representativePages(builtPages(dir)).map((built) => built.path)).toEqual([
      '/',
      '/blog',
      '/blog/a',
      '/blog/tag/x',
      '/compare',
      '/compare/one',
      '/en/',
    ])
  })
})
