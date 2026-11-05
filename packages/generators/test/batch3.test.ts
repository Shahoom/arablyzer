import { collectPage, collectRobots } from '@arablyzer/collectors'
import { evaluatePage } from '@arablyzer/engine'
import { RULES } from '@arablyzer/rules'
import { describe, expect, it } from 'vitest'
import {
  diffSitemaps,
  metaTags,
  planRedirects,
  readSitemap,
  redirectConfig,
  robotsFile,
  serpPreview,
  sitemapXml,
} from '../src/index'

const encode = (text: string) => new TextEncoder().encode(text)
const page = (html: string) =>
  collectPage({
    url: 'https://example.com/',
    status: 200,
    headers: [['content-type', 'text/html; charset=utf-8']],
    body: encode(html),
  })

describe('robotsFile', () => {
  const base = { blockPaths: [], training: 'allow', search: 'allow', sitemaps: [] } as const
  const judged = (text: string) => {
    const robots = collectRobots({
      url: 'https://example.com/robots.txt',
      response: { status: 200, body: encode(text), truncated: false },
      errorCode: null,
    })
    return evaluatePage(page('<!doctype html><p>مرحبا</p>'), {
      rules: RULES,
      ruleIds: ['robots-blocks-googlebot', 'robots-blocks-ai-search'],
      robots,
    })
      .results.map((result) => [result.id, result.status])
      .sort()
  }

  it('writes an open file when nothing is blocked', () => {
    expect(robotsFile(base).text).toBe('User-agent: *\nDisallow:\n')
  })

  it('blocks paths, keeps them from the root, and names the sitemaps', () => {
    const result = robotsFile({
      ...base,
      blockPaths: ['admin/', '/cart', '  ', '/cart', '/search?q='],
      sitemaps: [
        'https://example.com/sitemap.xml',
        'sitemap.xml',
        'https://example.com/sitemap.xml',
      ],
    })
    expect(result.text).toBe(
      'User-agent: *\nDisallow: /admin/\nDisallow: /cart\nDisallow: /search?q=\n\nSitemap: https://example.com/sitemap.xml\n',
    )
    expect(result.problems).toEqual([{ problem: 'sitemap-bad', input: 'sitemap.xml' }])
  })

  it('leaves out a path with a space or a comment mark, and says so', () => {
    const result = robotsFile({ ...base, blockPaths: ['/a b', '/ok#x', '/fine'] })
    expect(result.text).toBe('User-agent: *\nDisallow: /fine\n')
    expect(result.problems.map((p) => p.problem)).toEqual(['path-bad', 'path-bad'])
  })

  it('blocks training crawlers apart from search crawlers, and the robots rules agree', () => {
    const training = robotsFile({ ...base, training: 'block' }).text
    expect(training).toContain('User-agent: GPTBot')
    expect(training).toContain('User-agent: ClaudeBot')
    expect(training).toContain('User-agent: Google-Extended')
    expect(training).not.toContain('OAI-SearchBot')
    expect(judged(training)).toEqual([
      ['robots-blocks-ai-search', 'pass'],
      ['robots-blocks-googlebot', 'pass'],
    ])
    const search = robotsFile({ ...base, search: 'block' }).text
    expect(search).toContain('User-agent: OAI-SearchBot')
    expect(judged(search)[0]).toEqual(['robots-blocks-ai-search', 'fail'])
  })

  it('never blocks Googlebot by what it writes', () => {
    expect(
      judged(robotsFile({ ...base, blockPaths: ['/admin/'], training: 'block' }).text)[1],
    ).toEqual(['robots-blocks-googlebot', 'pass'])
  })
})

describe('sitemapXml', () => {
  it('writes the protocol’s file with a date where one is given', () => {
    const result = sitemapXml('https://example.com/\nhttps://example.com/a?x=1&y=2 2026-03-05\n')
    expect(result.count).toBe(2)
    expect(result.xml).toBe(
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
  </url>
  <url>
    <loc>https://example.com/a?x=1&amp;y=2</loc>
    <lastmod>2026-03-05</lastmod>
  </url>
</urlset>
`,
    )
  })

  it('encodes an Arabic address and turns Eastern digits in a date', () => {
    const result = sitemapXml('https://example.com/قهوة ٢٠٢٦-٠٣-٠٥')
    expect(result.xml).toContain('<loc>https://example.com/%D9%82%D9%87%D9%88%D8%A9</loc>')
    expect(result.xml).toContain('<lastmod>2026-03-05</lastmod>')
  })

  it('skips what the protocol does not take, and says why', () => {
    const result = sitemapXml(
      'https://example.com/a\nnot a url\nhttps://other.com/b\nhttps://example.com/a\nhttps://example.com/c 05/03/2026\nhttps://example.com/d 2026-02-30\nhttps://example.com/e#top',
    )
    expect(result.skipped.map(({ line, reason }) => [line, reason])).toEqual(
      [
        [2, 'not-url'],
        [3, 'other-host'],
        [4, 'duplicate'],
        [5, 'bad-date'],
      ].concat([[6, 'bad-date']]) as never,
    )
    expect(result.count).toBe(2)
  })

  it('is read back as written, and the file passes the sitemap rules', () => {
    const written = sitemapXml('https://example.com/a 2026-03-05\nhttps://example.com/b')
    const read = readSitemap(written.xml)
    expect(read.kind).toBe('urlset')
    expect([...read.entries]).toEqual([
      ['https://example.com/a', '2026-03-05'],
      ['https://example.com/b', null],
    ])
  })
})

describe('diffSitemaps', () => {
  const a = readSitemap(
    '<urlset><url><loc>https://x.com/a</loc><lastmod>2026-01-01</lastmod></url><url><loc>https://x.com/b?p=1&amp;q=2</loc></url><url><loc>https://x.com/c</loc></url></urlset>',
  )
  const b = readSitemap(
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://x.com/a</loc><lastmod>2026-02-01</lastmod></url><url><loc>https://x.com/b?p=1&amp;q=2</loc></url><url><loc>https://x.com/d</loc></url></urlset>',
  )
  it('names what was added, removed and dated again', () => {
    expect(diffSitemaps(a, b)).toEqual({
      added: ['https://x.com/d'],
      removed: ['https://x.com/c'],
      changed: [{ url: 'https://x.com/a', before: '2026-01-01', after: '2026-02-01' }],
      unchanged: 1,
    })
  })
  it('reads a sitemap index, and a body that is no sitemap', () => {
    expect(
      readSitemap('<sitemapindex><sitemap><loc>https://x.com/s1.xml</loc></sitemap></sitemapindex>')
        .kind,
    ).toBe('sitemapindex')
    expect(readSitemap('<html></html>')).toEqual({ kind: null, entries: new Map() })
  })
})

describe('planRedirects', () => {
  it('flattens a chain and keeps the straight ones', () => {
    const plan = planRedirects('/a /b\n/b /c\n/x /y')
    expect(plan.pairs).toEqual([
      { from: '/a', to: '/c' },
      { from: '/b', to: '/c' },
      { from: '/x', to: '/y' },
    ])
    expect(plan.flattened).toBe(1)
    expect(plan.problems.map((p) => [p.line, p.problem])).toEqual([[1, 'chain']])
  })

  it('finds a loop, a clash, a pair to itself, a duplicate and a line it cannot read', () => {
    const plan = planRedirects('/a /b\n/b /a\n/c /c\n/d /e\n/d /f\n/d /e\nonlyone\n/ok /fine')
    expect(plan.pairs).toEqual([
      { from: '/d', to: '/e' },
      { from: '/ok', to: '/fine' },
    ])
    expect(plan.problems.map((p) => [p.line, p.problem])).toEqual([
      [1, 'loop'],
      [2, 'loop'],
      [3, 'same'],
      [5, 'clash'],
      [6, 'duplicate'],
      [7, 'unreadable'],
    ])
  })

  it('reads arrows, commas, tabs, full addresses and Arabic paths', () => {
    const plan = planRedirects(
      'https://example.com/old -> https://example.com/new\n/قهوة,/coffee\n/p\t/q\n# note\n/trailing/ /t',
    )
    expect(plan.pairs).toEqual([
      { from: '/old', to: '/new' },
      { from: '/قهوة', to: '/coffee' },
      { from: '/p', to: '/q' },
      { from: '/trailing', to: '/t' },
    ])
  })

  it('refuses what could break a config, a second host, and a pattern in a source', () => {
    const plan = planRedirects(
      '/a"b /c\n/d;e /f\n/g /h$\n/i* /j\n/k?x=1 /l\nhttps://a.com/m https://b.com/n',
    )
    expect(plan.pairs).toEqual([])
    expect(plan.problems.map((p) => p.problem)).toEqual([
      'unsafe',
      'unsafe',
      'unsafe',
      'unsafe',
      'unsafe',
      'other-host',
    ])
  })
})

describe('redirectConfig', () => {
  const pairs = [
    { from: '/old.html', to: '/new' },
    { from: '/قهوة', to: '/coffee?x=1' },
  ]
  it('writes Apache with the path as the server reads it, escaped for the pattern', () => {
    expect(redirectConfig(pairs, 'apache', 301)).toBe(
      'RedirectMatch 301 "^/old\\.html/?$" "/new"\nRedirectMatch 301 "^/قهوة/?$" "/coffee?x=1"\n',
    )
  })
  it('writes nginx exact locations', () => {
    expect(redirectConfig(pairs, 'nginx', 302, 'https://example.com')).toBe(
      'location = /old.html { return 302 https://example.com/new; }\nlocation = /قهوة { return 302 https://example.com/coffee?x=1; }\n',
    )
  })
  it('writes a _redirects file with an encoded source', () => {
    expect(redirectConfig(pairs, 'redirects-file', 301)).toBe(
      '/old.html /new 301\n/%D9%82%D9%87%D9%88%D8%A9 /coffee?x=1 301\n',
    )
  })
  it('writes vercel.json', () => {
    expect(JSON.parse(redirectConfig(pairs, 'vercel', 308))).toEqual({
      redirects: [
        { source: '/old.html', destination: '/new', statusCode: 308 },
        { source: '/%D9%82%D9%87%D9%88%D8%A9', destination: '/coffee?x=1', statusCode: 308 },
      ],
    })
  })
})

describe('metaTags', () => {
  const input = {
    lang: 'ar',
    title: ' قهوة   عربية <بالهيل> ',
    description: 'قهوة عربية محمّصة تُشحن خلال يومين.',
    url: 'https://example.com/قهوة',
    siteName: 'متجر الواحة',
    image: 'https://example.com/og.png',
    noindex: false,
    article: false,
  } as const
  const judged = (head: string, htmlTag: string) =>
    evaluatePage(
      page(`<!doctype html>${htmlTag}<head>${head}</head><body><p>مرحبا</p></body></html>`),
      {
        rules: RULES,
        ruleIds: [
          'title-missing',
          'meta-description-missing',
          'og-tags-missing',
          'viewport-missing',
        ],
      },
    ).results.map((result) => [result.id, result.status])

  it('writes the tags the page checks read, escaped, and the checks pass them', () => {
    const result = metaTags(input)
    expect(result.htmlTag).toBe('<html lang="ar" dir="rtl">')
    expect(result.head).toContain('<title>قهوة عربية &lt;بالهيل&gt;</title>')
    expect(result.head).toContain(
      '<link rel="canonical" href="https://example.com/%D9%82%D9%87%D9%88%D8%A9">',
    )
    expect(result.head).toContain('<meta name="twitter:card" content="summary_large_image">')
    expect(judged(result.head, result.htmlTag)).toEqual([
      ['meta-description-missing', 'pass'],
      ['og-tags-missing', 'pass'],
      ['title-missing', 'pass'],
      ['viewport-missing', 'pass'],
    ])
  })

  it('leaves out what was not given, and says what is wrong', () => {
    const result = metaTags({
      ...input,
      title: '',
      description: '',
      url: 'nope',
      image: 'x.png',
      noindex: true,
      lang: 'en',
    })
    expect(result.problems).toEqual(['title-blank', 'url-bad', 'image-bad'])
    expect(result.head).toContain('<meta name="robots" content="noindex, follow">')
    expect(result.head).not.toContain('og:image')
    expect(result.head).toContain('content="summary"')
    expect(result.htmlTag).toBe('<html lang="en" dir="ltr">')
  })
})

describe('serpPreview', () => {
  const width = (text: string) => Array.from(text).length * 10
  it('cuts a title by its width and a description by its length', () => {
    const preview = serpPreview(
      'ق'.repeat(80),
      'ك'.repeat(170),
      'https://example.com/ar/قهوة-عربية',
      width,
    )
    expect(preview.titleCut).toBe(true)
    expect(width(preview.title)).toBeLessThanOrEqual(600)
    expect(preview.title.endsWith('…')).toBe(true)
    expect(preview.descriptionCut).toBe(true)
    expect(Array.from(preview.description)).toHaveLength(161)
    expect(preview.crumbs).toBe('https://example.com › ar › قهوة-عربية')
  })
  it('leaves a short title and description alone', () => {
    const preview = serpPreview(' عطر  العود ', 'وصف قصير', 'https://example.com/', width)
    expect(preview).toMatchObject({
      title: 'عطر العود',
      titleCut: false,
      description: 'وصف قصير',
      descriptionCut: false,
    })
    expect(preview.crumbs).toBe('https://example.com')
  })
})
