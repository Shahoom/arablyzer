import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  auditRulePage,
  auditRulePair,
  type AuditCheck,
  type ExpectedPage,
} from '../src/audit/index'

// The rule page template of BUILD-PLAN §6.2, on pages written by hand (fixtures/right/rule.*).
const fixture = (name: string) =>
  readFileSync(new URL(`fixtures/right/${name}`, import.meta.url), 'utf8')

const AR = fixture('rule.ar.html')
const EN = fixture('rule.en.html')
const ORIGIN = 'https://arablyzer.example'
const KNOWN = new Set(['/rules', '/en/rules', '/tools/rtl-check', '/en/tools/rtl-check'])
const ALTERNATES = { ar: `${ORIGIN}/rules/sample-rule`, en: `${ORIGIN}/en/rules/sample-rule` }
const EXPECTED: Readonly<Record<'ar' | 'en', ExpectedPage>> = {
  ar: { lang: 'ar', url: ALTERNATES.ar, alternates: ALTERNATES, origin: ORIGIN, knownPaths: KNOWN },
  en: { lang: 'en', url: ALTERNATES.en, alternates: ALTERNATES, origin: ORIGIN, knownPaths: KNOWN },
}

const failing = (problems: readonly { check: AuditCheck }[]) =>
  [...new Set(problems.map((problem) => problem.check))].sort()

function edit(html: string, find: string | RegExp, replace: string): string {
  const next = html.replace(find, replace)
  if (next === html) throw new Error(`the fixture has no ${String(find)}`)
  return next
}

describe('auditRulePage on the right pages', () => {
  it('finds nothing wrong with either language, or with the pair', () => {
    expect(auditRulePage(AR, EXPECTED.ar)).toEqual([])
    expect(auditRulePage(EN, EXPECTED.en)).toEqual([])
    expect(
      auditRulePair({ html: AR, expected: EXPECTED.ar }, { html: EN, expected: EXPECTED.en }),
    ).toEqual([])
  })

  it('accepts a rule without an example: some rules judge what no code shows', () => {
    const html = edit(AR, /<section id="example">.*<\/section>\n/, '')
    expect(auditRulePage(html, EXPECTED.ar)).toEqual([])
  })
})

// One defect per page, each failing exactly the checks listed.
describe.each<[string, string, AuditCheck[]]>([
  ['no why', edit(AR, /<section id="why">.*<\/section>\n/, ''), ['sections']],
  ['no fix', edit(AR, /<section id="fix">.*<\/section>\n/, ''), ['sections']],
  ['no detect', edit(AR, /<section id="detect">.*<\/section>\n/, ''), ['sections']],
  ['no references', edit(AR, /<section id="references">.*<\/section>\n/, ''), ['sections']],
  ['an empty fix', edit(AR, '<p>ضع الاتجاه في وسم html.</p>', ''), ['sections']],
  [
    'references without a source',
    edit(AR, /<a href="https:\/\/www\.w3\.org\/International\/">([^<]*)<\/a>/, '$1'),
    ['sections'],
  ],
  ['half an example', edit(AR, '<pre>&lt;html lang="ar" dir="rtl"&gt;</pre>', ''), ['sections']],
  [
    'the sections out of order',
    edit(
      edit(AR, /<section id="why">.*<\/section>\n/, ''),
      '<section id="references">',
      '<section id="why"><h2>لماذا يهم</h2><p>لأن الصفحة تُقرأ من اليمين.</p></section>\n<section id="references">',
    ),
    ['sections'],
  ],
  [
    'a hidden section',
    edit(AR, '<section id="detect">', '<section id="detect" hidden>'),
    ['sections'],
  ],
  ['no article', edit(AR, '"@type": "TechArticle"', '"@type": "WebPage"'), ['json-ld']],
  [
    "another page's article",
    edit(
      AR,
      '"url": "https://arablyzer.example/rules/sample-rule"',
      '"url": "https://arablyzer.example/rules"',
    ),
    ['json-ld'],
  ],
  ['an article in English', edit(AR, '"inLanguage": "ar"', '"inLanguage": "en"'), ['json-ld']],
  ['no breadcrumb', edit(AR, '"@type": "BreadcrumbList"', '"@type": "ItemList"'), ['json-ld']],
  ['no canonical', edit(AR, /<link rel="canonical"[^>]*>\n/, ''), ['canonical']],
  ['a link to no page', edit(AR, 'href="/tools/rtl-check"', 'href="/tools/nope"'), ['links']],
  [
    'a stretched word in its prose',
    edit(AR, 'لأن الصفحة تُقرأ', 'لأن الصـفـحـة تُقرأ'),
    ['own-rules'],
  ],
])('auditRulePage on an Arabic page with %s', (_name, html, checks) => {
  it(`fails ${checks.join(', ')}`, () => {
    expect(failing(auditRulePage(html, EXPECTED.ar))).toEqual(checks)
  })
})

describe('auditRulePage on samples', () => {
  it('lets a page quote what its rule flags, inside code', () => {
    const html = edit(AR, 'لأن الصفحة تُقرأ', 'لأن <code dir="ltr">الصـفـحـة</code> تُقرأ')
    expect(auditRulePage(html, EXPECTED.ar)).toEqual([])
  })
})
