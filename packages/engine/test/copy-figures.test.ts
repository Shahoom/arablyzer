import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { MEASURE_LIMITS } from '@arablyzer/browser'
import { MAX_SITE_LINKS, MAX_TEXT_ALTERNATIVES } from '@arablyzer/collectors'
import { MIN_DRAWN_WORDS, RENDERED_TEXT_LENGTH, SCRIPTED_SHARE } from '@arablyzer/rules'
import { describe, expect, it } from 'vitest'
import { DNS_TIMEOUT_MS } from '../src/dns'
import { CONCURRENCY, LINK_TIMEOUT_MS, LINKS_TIMEOUT_MS, MAX_LINKS } from '../src/links'
import { REFUSAL_STATUSES } from '../src/index'

// M2.3c review: the copy states figures of the checks' method (50 links, four at a time, twenty
// seconds in all, ten for each request, ten for DNS, the first 200 elements and 200 characters, the
// least words, "more than half"), and they had drifted from the code once. One test reads the
// rules' and the tools' copy in both languages, and docs/methodology.md, and takes each figure they
// state from the constant that does it.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
type Lang = 'en' | 'ar'

const rule = (id: string, lang: Lang) =>
  readFileSync(`${ROOT}packages/rules/src/rules/${id}/copy.${lang}.md`, 'utf8')
const tool = (slug: string, lang: Lang) =>
  readFileSync(`${ROOT}packages/tools/src/tools/${slug}/copy.${lang}.md`, 'utf8')
/** The methodology has both languages in one file, the Arabic first, apart at a line of dashes. */
const methodology = (lang: Lang) => {
  const [ar = '', en = ''] = readFileSync(`${ROOT}docs/methodology.md`, 'utf8').split(/^---$/m)
  return lang === 'ar' ? ar : en
}

const ONE_TO_TEN: Readonly<Record<Lang, readonly string[]>> = {
  en: ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'],
  ar: ['واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشر'],
}
/** A small number in words, as the copy writes it. */
function word(lang: Lang, number: number): string {
  const found = ONE_TO_TEN[lang][number - 1]
  if (found === undefined) throw new Error(`Add the word for ${String(number)} to this test`)
  return found
}
const seconds = (ms: number) => ms / 1000
/** A share as the copy writes it. */
const SHARES: Readonly<Record<number, { readonly en: string; readonly ar: string }>> = {
  0.5: { en: 'more than half', ar: 'أكثر من نصف' },
}
function share(lang: Lang): string {
  const found = SHARES[SCRIPTED_SHARE]
  if (found === undefined)
    throw new Error(`Add the words for ${String(SCRIPTED_SHARE)} to this test`)
  return found[lang]
}
/** 1000 as the copy writes it: 1,000. */
const thousands = (number: number) => number.toLocaleString('en-US')

/** What each text must say, from the code's constants, and the files it says it in. */
interface Statement {
  readonly what: string
  readonly en: string
  readonly ar: string
  readonly where: readonly (readonly [kind: 'rule' | 'tool' | 'methodology', name: string])[]
}

const LINK_FILES = [
  ['rule', 'link-broken'],
  ['tool', 'broken-links'],
  ['methodology', ''],
] as const

const STATEMENTS: readonly Statement[] = [
  {
    what: 'the links counted on a page',
    en: `${thousands(MAX_SITE_LINKS)} links at most`,
    ar: `أكثر من ${thousands(MAX_SITE_LINKS)} رابط في الصفحة`,
    where: LINK_FILES,
  },
  {
    what: 'the links asked for',
    en: `first ${String(MAX_LINKS)} links`,
    ar: `أول ${String(MAX_LINKS)} رابطاً`,
    where: [
      ['rule', 'link-broken'],
      ['methodology', ''],
    ],
  },
  {
    what: 'the links asked for, in the tool',
    en: `first ${String(MAX_LINKS)} of them`,
    ar: `أول ${String(MAX_LINKS)} منها`,
    where: [['tool', 'broken-links']],
  },
  {
    what: 'the requests at a time',
    en: `${word('en', CONCURRENCY)} at a time`,
    ar: `${word('ar', CONCURRENCY)} معاً`,
    where: LINK_FILES,
  },
  {
    what: 'all the checks',
    en: `${String(seconds(LINKS_TIMEOUT_MS))} seconds in all`,
    ar: `في ${String(seconds(LINKS_TIMEOUT_MS))} ثانية`,
    where: LINK_FILES,
  },
  {
    what: 'each request, since a link can take two',
    en: `each request within ${String(seconds(LINK_TIMEOUT_MS))} seconds`,
    ar: `كل طلب في ${String(seconds(LINK_TIMEOUT_MS))} ثوانٍ`,
    where: LINK_FILES,
  },
  {
    what: 'the DNS lookups',
    en: `within ${word('en', seconds(DNS_TIMEOUT_MS))} seconds`,
    ar: `في ${word('ar', seconds(DNS_TIMEOUT_MS))} ثوانٍ`,
    where: [
      ['tool', 'email-security'],
      ['methodology', ''],
    ],
  },
  {
    what: 'the names of a page that are read, from each end',
    en: `first ${thousands(MAX_TEXT_ALTERNATIVES)} and the last ${thousands(MAX_TEXT_ALTERNATIVES)} names`,
    ar: `أول ${thousands(MAX_TEXT_ALTERNATIVES)} اسم وآخر ${thousands(MAX_TEXT_ALTERNATIVES)} اسم`,
    where: [
      ['rule', 'payment-methods'],
      ['tool', 'payment-methods-detector'],
    ],
  },
  {
    what: 'the elements the browsers measure',
    en: `first ${String(MEASURE_LIMITS.maxBlocks)} visible elements`,
    ar: `أول ${String(MEASURE_LIMITS.maxBlocks)} عنصر`,
    where: [
      ['rule', 'js-only-content'],
      ['tool', 'js-rendering-check'],
      ['methodology', ''],
    ],
  },
  {
    what: 'the characters of each element',
    en: `first ${String(MEASURE_LIMITS.textLength)} characters`,
    ar: `أول ${String(MEASURE_LIMITS.textLength)} حرف`,
    where: [
      ['rule', 'js-only-content'],
      ['tool', 'js-rendering-check'],
      ['methodology', ''],
    ],
  },
  {
    what: 'the fewest words a browser is judged on',
    en: `at least ${String(MIN_DRAWN_WORDS)} Arabic words`,
    ar: `${String(MIN_DRAWN_WORDS)} كلمة عربية على الأقل`,
    where: [
      ['rule', 'js-only-content'],
      ['tool', 'js-rendering-check'],
      ['methodology', ''],
    ],
  },
  {
    what: 'the share of missing words that fails a page',
    en: share('en'),
    ar: share('ar'),
    where: [
      ['rule', 'js-only-content'],
      ['tool', 'js-rendering-check'],
      ['methodology', ''],
    ],
  },
]

const text = (kind: 'rule' | 'tool' | 'methodology', name: string, lang: Lang) =>
  kind === 'rule' ? rule(name, lang) : kind === 'tool' ? tool(name, lang) : methodology(lang)

describe('the figures the copy states', () => {
  for (const statement of STATEMENTS) {
    for (const lang of ['en', 'ar'] as const) {
      it.each(statement.where)(`say ${statement.what} (${lang}) in %s %s`, (kind, name) => {
        expect(text(kind, name, lang)).toContain(statement[lang])
      })
    }
  }

  // A figure the copy states beside these, in the same words, must be one of them: a stale number
  // in a sentence no statement above looks for is caught here.
  const files = [
    ...['link-broken', 'spf-missing', 'dmarc-missing', 'js-only-content', 'payment-methods'].map(
      (id) => ['rule', id] as const,
    ),
    ...['broken-links', 'email-security', 'js-rendering-check', 'payment-methods-detector'].map(
      (slug) => ['tool', slug] as const,
    ),
    ['methodology', ''] as const,
  ]
  const figures = (source: string, pattern: RegExp) =>
    [...source.matchAll(pattern)].map((match) => Number((match[1] ?? '').replaceAll(',', '')))

  it.each(files)(
    'states no other number of seconds, links, elements or words in %s %s',
    (kind, name) => {
      for (const lang of ['en', 'ar'] as const) {
        const source = text(kind, name, lang)
        const at = `${kind} ${name} ${lang}`
        const allowed = (values: readonly number[], found: readonly number[], what: string) => {
          for (const value of found)
            expect(values, `${at}: ${what} ${String(value)}`).toContain(value)
        }
        const secondsAllowed = [
          seconds(LINKS_TIMEOUT_MS),
          seconds(LINK_TIMEOUT_MS),
          seconds(DNS_TIMEOUT_MS),
        ]
        allowed(secondsAllowed, figures(source, /\b(\d+) (?:seconds|ثانية|ثوانٍ)/g), 'seconds')
        allowed(
          [MAX_LINKS, MAX_SITE_LINKS],
          figures(source, /\b(\d[\d,]*) (?:links|رابط)/g),
          'links',
        )
        allowed(
          [MAX_LINKS, MEASURE_LIMITS.maxBlocks, MEASURE_LIMITS.textLength, MAX_TEXT_ALTERNATIVES],
          figures(source, /(?:\bfirst|أول) (\d[\d,]*)/g),
          'first',
        )
        allowed([MIN_DRAWN_WORDS], figures(source, /\b(\d+) (?:Arabic words|كلمة عربية)/g), 'words')
        allowed([MAX_TEXT_ALTERNATIVES], figures(source, /\b(\d[\d,]*) (?:names|اسم)/g), 'names')
      }
    },
  )

  it('names the statuses of a refusal exactly where the copy lists them', () => {
    const listed = [...REFUSAL_STATUSES].sort()
    for (const [kind, name] of LINK_FILES) {
      for (const lang of ['en', 'ar'] as const) {
        const lines = text(kind, name, lang)
          .split('\n')
          .filter((line) => line.includes('`401`') || line.includes('401'))
        expect(lines.length, `${kind} ${name} ${lang}`).toBeGreaterThan(0)
        for (const line of lines) {
          const numbers = new Set(
            [...line.matchAll(/(?<!\d)([45]\d\d)(?!\d)/g)].map((match) => Number(match[1])),
          )
          // The range the rule fails on is written 400 to 599 beside them.
          for (const status of REFUSAL_STATUSES)
            expect(numbers, `${kind} ${name} ${lang}`).toContain(status)
          for (const each of numbers) {
            expect(
              [400, 599, ...REFUSAL_STATUSES],
              `${kind} ${name} ${lang} ${String(each)}`,
            ).toContain(each)
          }
        }
      }
    }
    expect(listed).toEqual([401, 403, 407, 429, 503])
  })

  it('agrees with the browser package about the length of a block of text', () => {
    expect(RENDERED_TEXT_LENGTH).toBe(MEASURE_LIMITS.textLength)
  })
})
