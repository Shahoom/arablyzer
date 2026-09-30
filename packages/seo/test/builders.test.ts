import { describe, expect, it } from 'vitest'
import {
  alternates,
  breadcrumbList,
  defineSite,
  escapeHtml,
  formatDate,
  jsonLdScript,
  localePath,
  pageUrl,
  PATHS,
  PREVIEW_SITE,
  renderHead,
  webApplication,
} from '../src/index'

const SITE = defineSite('https://arablyzer.example')

describe('escapeHtml', () => {
  it('escapes the five characters that matter in text and quoted attributes', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    )
    expect(escapeHtml('مرحبا «بكم»')).toBe('مرحبا «بكم»')
  })
})

describe('site and paths', () => {
  it('takes an https origin without a path, and rejects anything else', () => {
    expect(PREVIEW_SITE.origin).toBe('https://arablyzer.example')
    for (const origin of [
      'http://arablyzer.example',
      'https://arablyzer.example/',
      'https://arablyzer.example/ar',
      'arablyzer.example',
      'https://user@arablyzer.example',
    ]) {
      expect(() => defineSite(origin), origin).toThrow(TypeError)
    }
  })

  it('puts Arabic at the root and English under /en (BUILD-PLAN §1)', () => {
    expect(localePath('ar', PATHS.tool('rtl-check'))).toBe('/tools/rtl-check')
    expect(localePath('en', PATHS.tool('rtl-check'))).toBe('/en/tools/rtl-check')
    expect(localePath('ar', PATHS.home)).toBe('/')
    expect(localePath('en', PATHS.home)).toBe('/en/')
    expect(localePath('en', PATHS.rule('ar-html-lang'))).toBe('/en/rules/ar-html-lang')
    expect(pageUrl(SITE, 'en', PATHS.tools)).toBe('https://arablyzer.example/en/tools')
    expect(() => localePath('ar', 'tools')).toThrow(TypeError)
  })

  it('gives reciprocal alternates: ar, en, and x-default for the Arabic page', () => {
    expect(alternates(SITE, PATHS.tool('rtl-check'))).toEqual([
      { hreflang: 'ar', href: 'https://arablyzer.example/tools/rtl-check' },
      { hreflang: 'en', href: 'https://arablyzer.example/en/tools/rtl-check' },
      { hreflang: 'x-default', href: 'https://arablyzer.example/tools/rtl-check' },
    ])
  })
})

describe('formatDate', () => {
  it('writes the month by name, the same on every Node version', () => {
    expect(formatDate('2026-09-24', 'ar')).toBe('24 سبتمبر 2026')
    expect(formatDate('2026-01-05', 'en')).toBe('5 January 2026')
    expect(() => formatDate('2026-13-01', 'en')).toThrow(TypeError)
    expect(() => formatDate('24/09/2026', 'en')).toThrow(TypeError)
  })
})

describe('JSON-LD', () => {
  it('describes a free web application in the page language', () => {
    expect(
      webApplication({
        name: 'فحص RTL',
        description: 'وصف',
        url: 'https://arablyzer.example/tools/rtl-check',
        lang: 'ar',
      }),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'فحص RTL',
      description: 'وصف',
      url: 'https://arablyzer.example/tools/rtl-check',
      inLanguage: 'ar',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Any',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
    })
  })

  it('numbers breadcrumb items from 1', () => {
    expect(
      breadcrumbList([
        { name: 'الرئيسية', url: 'https://arablyzer.example/' },
        { name: 'الأدوات', url: 'https://arablyzer.example/tools' },
      ]),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'الرئيسية', item: 'https://arablyzer.example/' },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'الأدوات',
          item: 'https://arablyzer.example/tools',
        },
      ],
    })
  })

  it('cannot close its script element early', () => {
    const script = jsonLdScript({ name: '</script><script>alert(1)</script><!--' })
    expect(script).toBe(
      '<script type="application/ld+json">{"name":"\\u003c/script>\\u003cscript>alert(1)\\u003c/script>\\u003c!--"}</script>',
    )
    const json = script.slice('<script type="application/ld+json">'.length, -'</script>'.length)
    expect(JSON.parse(json)).toEqual({ name: '</script><script>alert(1)</script><!--' })
  })
})

describe('renderHead', () => {
  it('writes the metadata a tool page needs, escaped', () => {
    expect(
      renderHead({
        title: 'فحص "RTL" <1>',
        description: 'وصف & شرح',
        canonical: 'https://arablyzer.example/tools/rtl-check',
        alternates: alternates(SITE, PATHS.tool('rtl-check')),
        jsonLd: [{ '@type': 'Thing' }],
      }).split('\n'),
    ).toEqual([
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>فحص &quot;RTL&quot; &lt;1&gt;</title>',
      '<meta name="description" content="وصف &amp; شرح">',
      '<link rel="canonical" href="https://arablyzer.example/tools/rtl-check">',
      '<link rel="alternate" hreflang="ar" href="https://arablyzer.example/tools/rtl-check">',
      '<link rel="alternate" hreflang="en" href="https://arablyzer.example/en/tools/rtl-check">',
      '<link rel="alternate" hreflang="x-default" href="https://arablyzer.example/tools/rtl-check">',
      '<script type="application/ld+json">{"@type":"Thing"}</script>',
    ])
  })

  it('writes a robots meta only when asked', () => {
    expect(renderHead({ title: 'x', robots: 'noindex, nofollow' })).toContain(
      '<meta name="robots" content="noindex, nofollow">',
    )
    expect(renderHead({ title: 'x' })).not.toContain('robots')
  })
})
