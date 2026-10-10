import { SCHEMA_VERSION, type Report } from '@arablyzer/report-schema'
import { toolBySlug, type Tool } from '@arablyzer/tools'
import { parse, type DefaultTreeAdapterMap } from 'parse5'
import { describe, expect, it } from 'vitest'
import { PREVIEW_SITE, renderReportPage, renderToolPage } from '../src/index'

type Element = DefaultTreeAdapterMap['element']

function tool(slug: string): Tool {
  const found = toolBySlug(slug)
  if (found === undefined) throw new Error(`no tool ${slug}`)
  return found
}

/** Every element of a parsed page, template contents included; order does not matter here. */
function elements(html: string): Element[] {
  const out: Element[] = []
  const stack: DefaultTreeAdapterMap['parentNode'][] = [parse(html)]
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    const children = 'content' in node ? node.content.childNodes : node.childNodes
    for (const child of children) {
      if ('tagName' in child) out.push(child)
      if ('childNodes' in child) stack.push(child)
    }
  }
  return out
}

function order(html: string, needles: readonly string[]): number[] {
  return needles.map((needle) => {
    const index = html.indexOf(needle)
    if (index === -1) throw new Error(`missing ${needle}`)
    return index
  })
}

describe('renderToolPage', () => {
  const ar = renderToolPage(tool('rtl-check'), 'ar', PREVIEW_SITE)
  const en = renderToolPage(tool('rtl-check'), 'en', PREVIEW_SITE)

  it('is an Arabic page right to left, and an English page left to right', () => {
    expect(ar.startsWith('<!doctype html>\n<html lang="ar" dir="rtl">\n<head>\n')).toBe(true)
    expect(en.startsWith('<!doctype html>\n<html lang="en" dir="ltr">\n<head>\n')).toBe(true)
  })

  it('has its own canonical and reciprocal hreflang', () => {
    expect(ar).toContain('<link rel="canonical" href="https://arablyzer.example/tools/rtl-check">')
    expect(en).toContain(
      '<link rel="canonical" href="https://arablyzer.example/en/tools/rtl-check">',
    )
    for (const page of [ar, en]) {
      expect(page).toContain(
        '<link rel="alternate" hreflang="ar" href="https://arablyzer.example/tools/rtl-check">',
      )
      expect(page).toContain(
        '<link rel="alternate" hreflang="en" href="https://arablyzer.example/en/tools/rtl-check">',
      )
      expect(page).toContain(
        '<link rel="alternate" hreflang="x-default" href="https://arablyzer.example/tools/rtl-check">',
      )
    }
  })

  it('gives link previews the page title, description and URL in Open Graph tags', () => {
    for (const [page, url] of [
      [ar, 'https://arablyzer.example/tools/rtl-check'],
      [en, 'https://arablyzer.example/en/tools/rtl-check'],
    ] as const) {
      const title = /<title>(.*?)<\/title>/.exec(page)?.[1]
      const description = /<meta name="description" content="([^"]*)">/.exec(page)?.[1]
      expect(title).toBeDefined()
      expect(description).toBeDefined()
      expect(page).toContain(`<meta property="og:title" content="${title ?? ''}">`)
      expect(page).toContain(`<meta property="og:description" content="${description ?? ''}">`)
      expect(page).toContain(`<meta property="og:url" content="${url}">`)
      expect(page).toContain('<meta property="og:type" content="website">')
      expect(page).toContain('<meta property="og:site_name" content="Arablyzer">')
    }
  })

  it('describes the tool in JSON-LD, with the breadcrumb it shows', () => {
    const scripts = [...ar.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(
      (match) => JSON.parse(match[1] ?? '') as Record<string, unknown>,
    )
    expect(scripts.map((data) => data['@type'])).toEqual([
      'WebApplication',
      'BreadcrumbList',
      'FAQPage',
    ])
    expect(scripts[0]).toMatchObject({
      name: 'فحص RTL واتجاه الصفحة',
      url: 'https://arablyzer.example/tools/rtl-check',
      inLanguage: 'ar',
      offers: { price: 0 },
    })
    expect(scripts[1]).toMatchObject({
      itemListElement: [
        { position: 1, name: 'الرئيسية', item: 'https://arablyzer.example/' },
        { position: 2, name: 'الأدوات', item: 'https://arablyzer.example/tools' },
        {
          position: 3,
          name: 'فحص RTL واتجاه الصفحة',
          item: 'https://arablyzer.example/tools/rtl-check',
        },
      ],
    })
    expect(ar).toContain('<li><a href="/tools">الأدوات</a></li>')
  })

  it('follows the §6.1 template, in order, with the tool itself before any section', () => {
    const positions = order(ar, [
      '<h1>فحص RTL واتجاه الصفحة</h1>',
      '<form ',
      '<section id="checks">',
      '<section id="example">',
      '<section id="fix">',
      '<section id="faq">',
      '<section id="links">',
      '<section id="about">',
    ])
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(ar).toContain('<input id="url" name="url" type="url" required')
  })

  it('shows the live example as code, left to right', () => {
    expect(ar).toContain(
      '<h3>خطأ</h3>\n<pre dir="ltr"><code class="language-html">&lt;!doctype html&gt;',
    )
  })

  it('links to the rules it applies and to related tools, in the page language', () => {
    expect(ar).toContain(
      '<a href="/rules/rtl-html-dir">صفحة عربية بلا dir=&quot;rtl&quot; في وسم html</a>',
    )
    expect(ar).toContain(
      '<a href="/tools/bidi-isolation-check">فحص الأرقام والإنجليزي داخل العربي</a>',
    )
    expect(en).toContain(
      '<a href="/en/tools/bidi-isolation-check">Numbers and English in Arabic text checker</a>',
    )
    expect(en).toContain('<a href="/en/rules/ar-html-lang">')
  })

  it('says when it was last updated, and links to the other language', () => {
    expect(ar).toContain('<time datetime="2026-09-24">24 سبتمبر 2026</time>')
    expect(en).toContain('<time datetime="2026-09-24">24 September 2026</time>')
    expect(ar).toContain(
      '<a href="/en/tools/rtl-check" hreflang="en" lang="en" dir="ltr">English</a>',
    )
    expect(en).toContain('<a href="/tools/rtl-check" hreflang="ar" lang="ar" dir="rtl">العربية</a>')
  })

  it('refuses a slug that is not ASCII kebab-case', () => {
    const base = tool('rtl-check')
    expect(() =>
      renderToolPage({ ...base, slug: 'x"><script>alert(1)</script>' }, 'ar', PREVIEW_SITE),
    ).toThrow(TypeError)
  })

  it('escapes copy', () => {
    const base = tool('rtl-check')
    const hostile: Tool = {
      ...base,
      copy: { ...base.copy, ar: { ...base.copy.ar, title: '<img src=x onerror=alert(1)>' } },
    }
    const page = renderToolPage(hostile, 'ar', PREVIEW_SITE)
    expect(page).not.toContain('<img')
    expect(elements(page).some((element) => element.tagName === 'img')).toBe(false)
  })
})

function report(overrides: Partial<Report> = {}): Report {
  return {
    schemaVersion: SCHEMA_VERSION,
    generator: { name: 'arablyzer', version: '0.1.0', rulesetVersion: '0.1.0' },
    target: {
      url: 'https://example.com/"><script>alert(1)</script>',
      finalUrl: 'https://example.com/',
      fetchedAt: '2026-09-24T10:00:00.000Z',
      userAgent: 'ArablyzerBot/1.0 (+https://arablyzer.com/bot)',
      http: { status: 200, contentType: 'text/html', redirects: [] },
    },
    scan: {
      status: 'complete',
      durationMs: 5,
      notices: [{ code: 'little-text', message: { ar: '<b>تنبيه</b>', en: '<b>notice</b>' } }],
    },
    page: { lang: 'ar', dir: 'rtl', dominantScript: 'arabic' },
    summary: {
      pass: 0,
      fail: 1,
      needsReview: 0,
      notApplicable: 0,
      error: 0,
      bySeverity: { critical: 0, serious: 1, moderate: 0, minor: 0, info: 0 },
    },
    score: { overall: 0, categories: { intl: 0 }, partial: false, rules: { ran: 1, total: 1 } },
    rules: [
      {
        id: 'ar-html-lang',
        version: '1.0.0',
        category: 'intl',
        severity: 'serious',
        status: 'fail',
        title: { ar: 'لغة الصفحة', en: 'Page language' },
        findingsOmitted: 3,
      },
    ],
    findings: [
      {
        ruleId: 'ar-html-lang',
        severity: 'serious',
        fingerprint: '0123456789abcdef',
        message: {
          ar: 'الصفحة تعلن lang="<script>alert(1)</script>"',
          en: 'The page declares lang="<script>alert(1)</script>"',
        },
        evidence: {
          url: 'https://example.com/',
          selector: 'html[onload=alert(1)]',
          snippet: '<html lang="en" onmouseover="alert(1)">',
          location: { line: 2, column: 1 },
        },
      },
    ],
    facts: {},
    ...overrides,
  }
}

describe('renderReportPage', () => {
  const ar = renderReportPage(report(), 'ar')

  it('is never indexed, and has no canonical or hreflang', () => {
    expect(ar).toContain('<meta name="robots" content="noindex, nofollow">')
    expect(ar).not.toContain('rel="canonical"')
    expect(ar).not.toContain('hreflang')
  })

  it('renders everything from the scanned page as text: only our elements, attributes and links', () => {
    const ELEMENTS = new Set([
      'html',
      'head',
      'body',
      'meta',
      'title',
      'main',
      'h1',
      'h2',
      'h3',
      'p',
      'span',
      'time',
      'section',
      'ul',
      'li',
      'article',
      'a',
      'code',
      'pre',
    ])
    const ATTRIBUTES = new Set([
      'lang',
      'dir',
      'charset',
      'name',
      'content',
      'href',
      'datetime',
      'id',
    ])
    for (const page of [ar, renderReportPage(report(), 'en')]) {
      const tags = elements(page)
      expect(tags.map((element) => element.tagName).filter((name) => !ELEMENTS.has(name))).toEqual(
        [],
      )
      expect(
        tags
          .flatMap((element) => element.attrs.map((attribute) => attribute.name))
          .filter((name) => !ATTRIBUTES.has(name)),
      ).toEqual([])
      for (const link of tags.filter((element) => element.tagName === 'a')) {
        expect(link.attrs.find((attribute) => attribute.name === 'href')?.value).toMatch(
          /^\/(en\/)?rules\/[a-z0-9-]+$/,
        )
      }
    }
    expect(ar).toContain('lang=&quot;&lt;script&gt;alert(1)&lt;/script&gt;&quot;')
    expect(ar).toContain('&lt;html lang=&quot;en&quot; onmouseover=&quot;alert(1)&quot;&gt;')
  })

  it('names the evidence URL only when it is not the scanned page', () => {
    expect(ar).toContain('<p><code dir="ltr">html[onload=alert(1)]</code> · السطر 2</p>')
    const robots = report({
      findings: [
        {
          ruleId: 'ar-html-lang',
          severity: 'serious',
          fingerprint: '0123456789abcdef',
          message: { ar: 'ممنوع', en: 'blocked' },
          evidence: { url: 'https://example.com/robots.txt', location: { line: 3 } },
        },
      ],
    })
    expect(renderReportPage(robots, 'en')).toContain(
      '<p><span dir="ltr">https://example.com/robots.txt</span> · line 3</p>',
    )
  })

  it('links each problem to its rule page and counts the ones not shown', () => {
    expect(ar).toContain('<a href="/rules/ar-html-lang">لغة الصفحة</a>')
    expect(renderReportPage(report(), 'en')).toContain(
      '<a href="/en/rules/ar-html-lang">Page language</a>',
    )
    expect(ar).toContain('… +3')
  })

  // M0.3 review: a failed scan said "The rules found no problems."
  it('claims no clean result when rules did not run, and lists the ones that could not', () => {
    const failed = report({
      scan: {
        status: 'failed',
        durationMs: 1,
        notices: [
          { code: 'dns-failed', message: { ar: 'تعذّر العثور على النطاق', en: 'DNS failed' } },
        ],
      },
      summary: {
        pass: 0,
        fail: 0,
        needsReview: 0,
        notApplicable: 0,
        error: 1,
        bySeverity: { critical: 0, serious: 0, moderate: 0, minor: 0, info: 0 },
      },
      rules: [
        {
          id: 'ar-html-lang',
          version: '1.0.0',
          category: 'intl',
          severity: 'serious',
          status: 'error',
          title: { ar: 'لغة الصفحة', en: 'Page language' },
          error: 'page-unavailable',
        },
      ],
      findings: [],
    })
    const page = renderReportPage(failed, 'en')
    expect(page).not.toContain('The rules found no problems.')
    expect(page).not.toContain('<section id="findings">')
    expect(page).toContain('<li>DNS failed</li>')

    const partial = report({
      scan: { status: 'partial', durationMs: 1, notices: [] },
      rules: [
        ...report().rules,
        {
          id: 'robots-blocks-googlebot',
          version: '1.0.0',
          category: 'crawl',
          severity: 'critical',
          status: 'error',
          title: { ar: 'Googlebot ممنوع', en: 'Googlebot blocked' },
          error: 'robots-unchecked',
        },
      ],
    })
    expect(renderReportPage(partial, 'en')).toContain(
      '<section id="errors">\n<h2>Rules that could not run</h2>\n<ul><li><a href="/en/rules/robots-blocks-googlebot">Googlebot blocked</a> <code dir="ltr">robots-unchecked</code></li></ul>',
    )
  })

  // M0.3 review: a hostile lang attribute put U+202E into the page.
  it('shows controls and bidi overrides from the scanned page as escapes', () => {
    const hostile = report({
      findings: [
        {
          ruleId: 'ar-html-lang',
          severity: 'serious',
          fingerprint: '0123456789abcdef',
          message: { ar: 'lang="x\u202Ey"', en: 'lang="x\u202Ey\u2066"' },
          evidence: { selector: 'html\u0007', snippet: '<p>\n\t\u202E</p>' },
        },
      ],
    })
    const page = renderReportPage(hostile, 'en')
    expect(page).not.toMatch(/[\u202A-\u202E\u2066-\u2069]/)
    expect(page).toContain('lang=&quot;x\\u202Ey\\u2066&quot;')
    expect(page).toContain('<code dir="ltr">html\\u0007</code>')
    expect(page).toContain('<pre dir="ltr"><code>&lt;p&gt;\n\t\\u202E&lt;/p&gt;</code></pre>')
  })

  it('uses the page language and direction', () => {
    expect(ar.startsWith('<!doctype html>\n<html lang="ar" dir="rtl">')).toBe(true)
    expect(
      renderReportPage(report(), 'en').startsWith('<!doctype html>\n<html lang="en" dir="ltr">'),
    ).toBe(true)
  })
})
