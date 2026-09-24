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

  it('describes the tool in JSON-LD, with the breadcrumb it shows', () => {
    const scripts = [...ar.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(
      (match) => JSON.parse(match[1] ?? '') as Record<string, unknown>,
    )
    expect(scripts.map((data) => data['@type'])).toEqual(['WebApplication', 'BreadcrumbList'])
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
    expect(ar).toContain('<a href="/tools/whatsapp-link-check">فحص رابط واتساب</a>')
    expect(en).toContain('<a href="/en/tools/whatsapp-link-check">WhatsApp link checker</a>')
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

  it('renders everything from the scanned page as text', () => {
    const tags = elements(ar)
    expect(tags.some((element) => element.tagName === 'script')).toBe(false)
    expect(
      tags.some((element) => element.attrs.some((attribute) => attribute.name.startsWith('on'))),
    ).toBe(false)
    expect(ar).toContain('lang=&quot;&lt;script&gt;alert(1)&lt;/script&gt;&quot;')
    expect(ar).toContain('&lt;html lang=&quot;en&quot; onmouseover=&quot;alert(1)&quot;&gt;')
  })

  it('links each problem to its rule page and counts the ones not shown', () => {
    expect(ar).toContain('<a href="/rules/ar-html-lang">لغة الصفحة</a>')
    expect(renderReportPage(report(), 'en')).toContain(
      '<a href="/en/rules/ar-html-lang">Page language</a>',
    )
    expect(ar).toContain('… +3')
  })

  it('uses the page language and direction', () => {
    expect(ar.startsWith('<!doctype html>\n<html lang="ar" dir="rtl">')).toBe(true)
    expect(
      renderReportPage(report(), 'en').startsWith('<!doctype html>\n<html lang="en" dir="ltr">'),
    ).toBe(true)
  })
})
