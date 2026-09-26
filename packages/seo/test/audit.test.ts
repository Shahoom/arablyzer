import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  auditPair,
  auditReportPage,
  auditToolPage,
  type AuditCheck,
  type ExpectedPage,
} from '../src/audit/index'

const fixture = (name: string) =>
  readFileSync(new URL(`fixtures/right/${name}`, import.meta.url), 'utf8')

const AR = fixture('ar.html')
const EN = fixture('en.html')
const ORIGIN = 'https://arablyzer.example'

const KNOWN = new Set([
  '/',
  '/en/',
  '/tools/sample-check',
  '/en/tools/sample-check',
  '/tools/rtl-check',
  '/en/tools/rtl-check',
  '/rules/rtl-html-dir',
  '/en/rules/rtl-html-dir',
])

const ALTERNATES = {
  ar: `${ORIGIN}/tools/sample-check`,
  en: `${ORIGIN}/en/tools/sample-check`,
}

const EXPECTED: Readonly<Record<'ar' | 'en', ExpectedPage>> = {
  ar: { lang: 'ar', url: ALTERNATES.ar, alternates: ALTERNATES, origin: ORIGIN, knownPaths: KNOWN },
  en: { lang: 'en', url: ALTERNATES.en, alternates: ALTERNATES, origin: ORIGIN, knownPaths: KNOWN },
}

/** The checks that fail, each once, sorted. */
function failing(problems: readonly { check: AuditCheck }[]): AuditCheck[] {
  return [...new Set(problems.map((problem) => problem.check))].sort()
}

/** A copy of the right page with one defect. */
function edit(html: string, find: string | RegExp, replace: string): string {
  const next = html.replace(find, replace)
  if (next === html) throw new Error(`the fixture has no ${String(find)}`)
  return next
}

describe('auditToolPage on the right pages', () => {
  it('finds nothing wrong with either language', () => {
    expect(auditToolPage(AR, EXPECTED.ar)).toEqual([])
    expect(auditToolPage(EN, EXPECTED.en)).toEqual([])
    expect(
      auditPair({ html: AR, expected: EXPECTED.ar }, { html: EN, expected: EXPECTED.en }),
    ).toEqual([])
  })
})

// One defect per page; each must fail exactly the checks listed, so the auditor is neither
// blind to a problem nor noisy about a correct part.
describe.each<[string, string, AuditCheck[]]>([
  ['no dir="rtl"', edit(AR, ' dir="rtl"', ''), ['lang-dir', 'own-rules']],
  ['an English lang', edit(AR, 'lang="ar"', 'lang="en"'), ['lang-dir', 'own-rules']],
  ['no title', edit(AR, /<title>.*<\/title>\n/, ''), ['title']],
  ['no meta description', edit(AR, /<meta name="description"[^>]*>\n/, ''), ['description']],
  ['two H1s', edit(AR, '<h1>فحص نموذجي</h1>', '<h1>فحص نموذجي</h1><h1>ثانٍ</h1>'), ['h1']],
  ['no H1', edit(AR, '<h1>فحص نموذجي</h1>', '<p>فحص نموذجي</p>'), ['h1']],
  [
    'the tool below a section',
    edit(
      edit(AR, /<form [^\n]*<\/form>\n/, ''),
      '</section>\n<section id="example">',
      '</section>\n<form action="/tools/sample-check"><input type="url" name="url"><button>افحص</button></form>\n<section id="example">',
    ),
    ['tool-first'],
  ],
  ['no URL field', edit(AR, 'type="url"', 'type="text"'), ['tool-first']],
  ['no FAQ', edit(AR, /<section id="faq">.*<\/section>\n/, ''), ['sections']],
  [
    'an empty "what it checks"',
    edit(AR, '<ul><li>بنية الصفحة ووسومها.</li></ul>', ''),
    ['sections'],
  ],
  ['one example', edit(AR, '<pre>&lt;p&gt;صحيح&lt;/p&gt;</pre>', ''), ['sections']],
  ['no update date', edit(AR, / <time[^>]*>.*<\/time>/, ''), ['sections']],
  ['no canonical', edit(AR, /<link rel="canonical"[^>]*>\n/, ''), ['canonical']],
  [
    'a canonical to another page',
    edit(
      AR,
      `rel="canonical" href="${ORIGIN}/tools/sample-check"`,
      `rel="canonical" href="${ORIGIN}/"`,
    ),
    ['canonical'],
  ],
  [
    'the canonical twice',
    edit(
      AR,
      '<link rel="canonical"',
      `<link rel="canonical" href="${ALTERNATES.ar}">\n<link rel="canonical"`,
    ),
    ['canonical'],
  ],
  [
    'no x-default',
    edit(AR, /<link rel="alternate" hreflang="x-default"[^>]*>\n/, ''),
    ['hreflang', 'reciprocal'],
  ],
  [
    'x-default on the English page',
    edit(
      AR,
      `hreflang="x-default" href="${ALTERNATES.ar}"`,
      `hreflang="x-default" href="${ALTERNATES.en}"`,
    ),
    ['hreflang', 'reciprocal'],
  ],
  [
    'a code that is not ISO',
    edit(
      AR,
      '<link rel="alternate" hreflang="ar"',
      `<link rel="alternate" hreflang="ar-KSA" href="${ALTERNATES.ar}">\n<link rel="alternate" hreflang="ar"`,
    ),
    ['hreflang', 'own-rules', 'reciprocal'],
  ],
  ['a price', edit(AR, '"price": "0"', '"price": "10"'), ['json-ld']],
  [
    'no BreadcrumbList',
    edit(
      AR,
      /<script type="application\/ld\+json">\n\{\n {2}"@context": "https:\/\/schema.org",\n {2}"@type": "BreadcrumbList"[\s\S]*?<\/script>\n/,
      '',
    ),
    ['json-ld'],
  ],
  [
    'JSON-LD that is not JSON',
    edit(AR, '"inLanguage": "ar",', '"inLanguage": "ar",,'),
    ['json-ld', 'own-rules'],
  ],
  [
    'a WebApplication in English',
    edit(AR, '"inLanguage": "ar"', '"inLanguage": "en"'),
    ['json-ld'],
  ],
  [
    'noindex',
    edit(
      AR,
      '<meta charset="utf-8">',
      '<meta charset="utf-8">\n<meta name="robots" content="noindex">',
    ),
    ['indexable', 'own-rules'],
  ],
  [
    'a link to a page that does not exist',
    edit(AR, 'href="/tools/rtl-check"', 'href="/tools/nope"'),
    ['links'],
  ],
  ['a link over plain http', edit(AR, 'https://www.w3.org/', 'http://www.w3.org/'), ['links']],
  [
    'a javascript: link',
    edit(AR, 'href="/tools/rtl-check"', 'href="javascript:alert(1)"'),
    ['links'],
  ],
  ['Latin punctuation in Arabic copy', edit(AR, 'الذاتي، بلا', 'الذاتي, بلا'), ['own-rules']],
  // M0.3 review: the template's order and content, not only its parts.
  [
    '#about before #checks',
    edit(
      edit(AR, /<section id="about">.*<\/section>\n/, ''),
      '<section id="checks">',
      `${/<section id="about">.*<\/section>/.exec(AR)?.[0] ?? ''}\n<section id="checks">`,
    ),
    ['sections'],
  ],
  [
    'the H1 after every section',
    edit(edit(AR, '<h1>فحص نموذجي</h1>\n', ''), '</main>', '<h1>فحص نموذجي</h1>\n</main>'),
    ['h1', 'tool-first'],
  ],
  [
    'the tool before the H1',
    edit(
      edit(AR, /<form [^\n]*<\/form>\n/, ''),
      '<h1>',
      '<form action="/tools/sample-check"><input type="url" name="url"><button>افحص</button></form>\n<h1>',
    ),
    ['tool-first'],
  ],
  ['no description under the H1', edit(AR, /<p>صفحة أداة كتبناها[^\n]*<\/p>\n/, ''), ['h1']],
  [
    '#fix without code',
    edit(AR, '<pre>&lt;html lang="ar" dir="rtl"&gt;</pre></section>', '</section>'),
    ['sections'],
  ],
  [
    '#about without the methodology',
    edit(AR, '<p>نقرأ HTML كما يرسله الخادم.</p>', ''),
    ['sections'],
  ],
  [
    'an empty check item',
    edit(AR, '<li>بنية الصفحة ووسومها.</li>', '<li>بنية الصفحة ووسومها.</li><li> </li>'),
    ['sections'],
  ],
  ['an empty example', edit(AR, '<pre>&lt;p&gt;صحيح&lt;/p&gt;</pre>', '<pre></pre>'), ['sections']],
  ['an empty question', edit(AR, '<h3>ما هذه الصفحة؟</h3>', '<h3></h3>'), ['sections']],
  ['a hidden tool form', edit(AR, '<form action=', '<form hidden action='), ['tool-first']],
  [
    'a hidden section',
    edit(AR, '<section id="faq">', '<section id="faq" style="display: none">'),
    ['sections'],
  ],
  [
    'JSON-LD without @context',
    edit(
      AR,
      '{\n  "@context": "https://schema.org",\n  "@type": "WebApplication",',
      '{\n  "@type": "WebApplication",',
    ),
    ['json-ld'],
  ],
  [
    'JSON-LD in another vocabulary',
    edit(
      AR,
      '"@context": "https://schema.org",\n  "@type": "WebApplication"',
      '"@context": "https://evil.example/",\n  "@type": "WebApplication"',
    ),
    ['json-ld'],
  ],
  [
    'a tool marked as not free',
    edit(AR, '"inLanguage": "ar",', '"inLanguage": "ar",\n  "isAccessibleForFree": false,'),
    ['json-ld'],
  ],
  [
    'a paid offer beside the free one',
    edit(
      AR,
      '"offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }',
      '"offers": [{ "@type": "Offer", "price": "0", "priceCurrency": "USD" }, { "@type": "Offer", "price": "49", "priceCurrency": "USD" }]',
    ),
    ['json-ld'],
  ],
  ['a price that only parses as zero', edit(AR, '"price": "0"', '"price": "0x0"'), ['json-ld']],
  [
    'a breadcrumb off the site',
    edit(AR, '"item": "https://arablyzer.example/" }', '"item": "https://evil.example/" }'),
    ['json-ld'],
  ],
  ['a breadcrumb without a name', edit(AR, '"name": "الرئيسية"', '"name": " "'), ['json-ld']],
  [
    'the meta description in <body>',
    edit(
      edit(AR, /<meta name="description"[^>]*>\n/, ''),
      '<main>',
      '<main>\n<meta name="description" content="وصف في غير مكانه.">',
    ),
    ['description'],
  ],
  [
    'a <base> that leaves the site',
    edit(
      AR,
      '<meta charset="utf-8">',
      '<meta charset="utf-8">\n<base href="https://evil.example/">',
    ),
    ['links'],
  ],
  [
    'a link with a backslash',
    edit(AR, 'href="/tools/rtl-check"', 'href="/\\evil.example/"'),
    ['links'],
  ],
])('auditToolPage on an Arabic page with %s', (_name, html, checks) => {
  it(`fails ${checks.join(', ')}`, () => {
    const alone = failing(auditToolPage(html, EXPECTED.ar))
    const paired = failing(
      auditPair({ html, expected: EXPECTED.ar }, { html: EN, expected: EXPECTED.en }),
    )
    expect(paired).toEqual(checks)
    expect(alone).toEqual(checks.filter((check) => check !== 'reciprocal'))
  })
})

// M0.3 review: correct pages the audit used to fail.
describe.each([
  ['upper-case lang and dir', edit(AR, 'lang="ar" dir="rtl"', 'lang="AR" dir="RTL"')],
  ['an upper-case input type', edit(AR, 'type="url"', 'type="URL"')],
  [
    'both application types on one node',
    edit(AR, '"@type": "WebApplication"', '"@type": ["WebApplication", "SoftwareApplication"]'),
  ],
  [
    'a date and time',
    edit(AR, '<time datetime="2026-09-24">', '<time datetime="2026-09-24T00:00:00Z">'),
  ],
  [
    'an answer written as bare text',
    edit(
      AR,
      '<h3>ما هذه الصفحة؟</h3><p>نموذج للاختبار فقط.</p>',
      '<h3>ما هذه الصفحة؟</h3>نموذج للاختبار فقط.',
    ),
  ],
])('auditToolPage on a correct Arabic page with %s', (_name, html) => {
  it('finds nothing wrong', () => {
    expect(auditToolPage(html, EXPECTED.ar)).toEqual([])
  })
})

describe('auditPair', () => {
  it('fails pages that do not name each other', () => {
    const en = edit(
      EN,
      `hreflang="ar" href="${ALTERNATES.ar}"`,
      `hreflang="ar" href="${ORIGIN}/tools/other"`,
    )
    expect(
      failing(auditPair({ html: AR, expected: EXPECTED.ar }, { html: en, expected: EXPECTED.en })),
    ).toEqual(['hreflang', 'reciprocal'])
  })

  it('says which page each problem is on', () => {
    const problems = auditPair(
      { html: edit(AR, /<title>.*<\/title>\n/, ''), expected: EXPECTED.ar },
      { html: EN, expected: EXPECTED.en },
    )
    expect(problems).toEqual([
      { page: ALTERNATES.ar, check: 'title', message: expect.any(String) as string },
    ])
  })
})

describe('auditReportPage', () => {
  const REPORT = `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>تقرير</title><meta name="robots" content="noindex, nofollow"></head>
<body><main><h1>تقرير Arablyzer</h1><p>الصفحة المفحوصة.</p></main></body>
</html>`

  it('passes a report page that is not indexed', () => {
    expect(auditReportPage(REPORT, 'ar')).toEqual([])
  })

  it('accepts robots "none", which is noindex too', () => {
    expect(
      auditReportPage(edit(REPORT, 'content="noindex, nofollow"', 'content="none"'), 'ar'),
    ).toEqual([])
  })

  // M0.3 review: a stray element (a tracking pixel, say) before the meta closes <head>, and the
  // meta that lands in <body> is not read.
  it('does not count a robots meta pushed out of <head>', () => {
    const pushed = edit(
      REPORT,
      '<meta name="robots"',
      '<img src="/pixel.gif" alt=""><meta name="robots"',
    )
    expect(failing(auditReportPage(pushed, 'ar'))).toEqual(['noindex'])
  })

  it('fails one that could be indexed, or that claims a canonical', () => {
    expect(failing(auditReportPage(edit(REPORT, / ?<meta name="robots"[^>]*>/, ''), 'ar'))).toEqual(
      ['noindex'],
    )
    expect(
      failing(
        auditReportPage(
          edit(REPORT, '</head>', `<link rel="canonical" href="${ORIGIN}/r/1"></head>`),
          'ar',
        ),
      ),
    ).toEqual(['canonical'])
  })
})
