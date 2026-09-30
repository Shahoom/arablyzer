import { SCAN_ERROR_CODES } from '@arablyzer/api-contract/codes'
import { DEFAULT_POLICY } from '@arablyzer/egress'
import { describe, expect, it } from 'vitest'
import {
  ALL_COPY,
  CATEGORIES,
  codeParts,
  HOME,
  PAGES_UI,
  REPORT,
  SCAN_FORM,
  SITE,
  TOOL_APP,
  TOOLS_UI,
  TOPICS,
} from '../src/index'

/** What copy that takes an object of numbers is called with: the score's weights, the bot's limits. */
const SAMPLE = {
  critical: 10,
  serious: 5,
  moderate: 3,
  minor: 1,
  pageRedirects: 10,
  robotsRedirects: 5,
  robotsKib: 500,
  sitemaps: 3,
  sitemapMib: 25,
  sitemapRedirects: 10,
  sitemapSeconds: 10,
  requestsPerLoad: 300,
  mibPerLoad: 25,
  viewport: { width: 390, height: 844 },
  dohUrl: 'https://cloudflare-dns.com/dns-query',
  links: 50,
}

/** A function of the copy with sample numbers, or with SAMPLE when it takes an object of them. */
function call(fn: (...args: unknown[]) => unknown): unknown {
  try {
    const out = fn(3, 18, 390)
    if (!JSON.stringify(out).includes('undefined')) return out
  } catch {
    // It reads an object's fields.
  }
  return fn(SAMPLE)
}

/** Every leaf of an object, with its path; functions are called with sample numbers. */
function leaves(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]]
  if (typeof value === 'function') {
    return leaves(call(value as (...args: unknown[]) => unknown), `${path}()`)
  }
  if (Array.isArray(value)) return value.flatMap((item, index) => leaves(item, `${path}[${index}]`))
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => leaves(item, `${path}.${key}`))
  }
  return []
}

describe('the bot’s page', () => {
  // Numbers no other line of the page has, so a line is found by its own.
  const numbers = {
    pageRedirects: 10,
    robotsRedirects: 5,
    robotsKib: 500,
    sitemaps: 3,
    sitemapMib: 26,
    sitemapRedirects: 7,
    sitemapSeconds: 12,
    requestsPerLoad: 300,
    mibPerLoad: 25,
    viewport: { width: 390, height: 844 },
    dohUrl: 'https://cloudflare-dns.com/dns-query',
    links: 50,
  }
  const items = (lang: 'ar' | 'en') => PAGES_UI[lang].bot.fetches.items(numbers).join('\n')

  // M2.3c review: the page said the bot reads sitemaps, and not that it may go to another host for
  // one, that it follows redirects for them, or when it stops.
  it.each([
    ['en', ['7 redirects', '12 seconds', 'another host', 'first 3', '26 MB']],
    ['ar', ['7 تحويلات', '12 ثانية', 'موقع آخر', 'أول 3 خرائط', '26 ميغابايت']],
  ] as const)('says what it does for the sitemaps, in %s', (lang, phrases) => {
    for (const phrase of phrases) expect(items(lang), phrase).toContain(phrase)
  })

  it('says a sitemap on another host is fetched only where that host’s robots.txt allows it', () => {
    expect(items('en')).toMatch(/another host[^\n]*robots\.txt[^\n]*ArablyzerBot/)
    expect(items('ar')).toMatch(/موقع آخر[^\n]*robots\.txt[^\n]*ArablyzerBot/)
  })

  it('says a browser answered with a challenge stops there', () => {
    expect(PAGES_UI.en.bot.never.items.join('\n')).toContain('that browser')
    expect(PAGES_UI.ar.bot.never.items.join('\n')).toContain('ذلك المتصفح')
  })
})

describe('interface copy', () => {
  it('has the same keys in both languages, none empty', () => {
    for (const [file, copy] of Object.entries(ALL_COPY)) {
      const ar = leaves(copy.ar)
      const en = leaves(copy.en)
      expect(
        ar.map(([path]) => path),
        file,
      ).toEqual(en.map(([path]) => path))
      for (const [path, text] of [...ar, ...en]) {
        expect(text.trim(), `${file} ${path}`).not.toBe('')
        expect(text, `${file} ${path}`).not.toMatch(/undefined|NaN|\[object/)
      }
    }
  })

  it('writes Arabic without directional marks, which the page sets with dir instead', () => {
    for (const copy of Object.values(ALL_COPY)) {
      for (const [path, text] of leaves(copy.ar)) {
        expect(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/u.test(text), path).toBe(false)
      }
    }
  })

  it('has words for every error the API can give', () => {
    for (const code of SCAN_ERROR_CODES) {
      expect(SCAN_FORM.ar.errors[code]).toBeTruthy()
      expect(SCAN_FORM.en.errors[code]).toBeTruthy()
    }
  })

  it('names the ports the egress policy allows', () => {
    expect(DEFAULT_POLICY.allowedPorts).toEqual([80, 443])
  })

  it('counts in Arabic as Arabic counts', () => {
    const tally = HOME.ar.figure.tally
    expect(tally(3, 18)).toBe('فشلت 3 قواعد · نجحت 18 قاعدة')
    expect(tally(1, 2)).toBe('فشلت قاعدة واحدة · نجحت قاعدتان')
    expect(tally(0, 11)).toBe('لم تفشل أي قاعدة · نجحت 11 قاعدة')
    expect(tally(103, 100)).toBe('فشلت 103 قواعد · نجحت 100 قاعدة')
    expect(HOME.en.figure.tally(1, 18)).toBe('1 rule failed · 18 passed')
    expect(HOME.en.figure.tally(0, 20)).toBe('No rule failed · 20 passed')
  })

  it('says when to scan again, in whole minutes rounded up', () => {
    expect(SCAN_FORM.ar.retryAfter(30)).toBe('جرّب بعد دقيقة.')
    expect(SCAN_FORM.ar.retryAfter(120)).toBe('جرّب بعد دقيقتين.')
    expect(SCAN_FORM.ar.retryAfter(301)).toBe('جرّب بعد 6 دقائق.')
    expect(SCAN_FORM.ar.retryAfter(3600)).toBe('جرّب بعد 60 دقيقة.')
    expect(SCAN_FORM.en.retryAfter(61)).toBe('Try again in 2 minutes.')
    expect(SCAN_FORM.en.retryAfter(1)).toBe('Try again in 1 minute.')
  })

  it('names every topic of the strip', () => {
    for (const topic of TOPICS) {
      expect(HOME.ar.topics.names[topic]).toBeTruthy()
      expect(HOME.en.topics.names[topic]).toBeTruthy()
    }
  })

  it('splits code out of text', () => {
    expect(codeParts('use `--json` for `all`.')).toEqual([
      { text: 'use ', code: false },
      { text: '--json', code: true },
      { text: ' for ', code: false },
      { text: 'all', code: true },
      { text: '.', code: false },
    ])
    expect(SITE.ar.tagline).toBe('محلّل المواقع العربية')
  })
})

describe('a tool’s copy', () => {
  it('says how many tools the directory’s search shows, of how many', () => {
    expect([0, 1, 2, 3, 12].map((n) => TOOLS_UI.ar.directory.shown(n, 12))).toEqual([
      '0 أداة من 12',
      'أداة واحدة من 12',
      'أداتان من 12',
      '3 أدوات من 12',
      '12 أداة من 12',
    ])
    expect([0, 1, 3].map((n) => TOOLS_UI.en.directory.shown(n, 3))).toEqual([
      '0 of 3 tools',
      '1 of 3 tools',
      '3 of 3 tools',
    ])
    expect(TOOLS_UI.en.directory.shown(1, 1)).toBe('1 of 1 tool')
  })

  it('names the rules a result lists as many as they are', () => {
    expect([1, 2, 3, 11, 100].map((n) => TOOL_APP.ar.result.rules(n))).toEqual([
      'القاعدة:',
      'القاعدتان:',
      'القواعد:',
      'القواعد:',
      'القواعد:',
    ])
    expect([1, 2, 0].map((n) => TOOL_APP.en.result.rules(n))).toEqual(['Rule:', 'Rules:', 'Rules:'])
  })
})

describe('report copy', () => {
  it('names every category the report schema has', async () => {
    const { Category } = await import('@arablyzer/report-schema')
    expect([...CATEGORIES].sort()).toEqual([...Category.options].sort())
  })

  it('counts rules and the queue as each language counts', () => {
    expect(REPORT.ar.progress.rules(47)).toBe('47 قاعدة')
    expect(REPORT.ar.progress.rules(3)).toBe('3 قواعد')
    expect(REPORT.ar.progress.queued(0)).toBe('في الطابور، وهو التالي')
    expect(REPORT.ar.progress.queued(2)).toBe('في الطابور، وعدد الفحوص قبلنا: 2')
    expect(REPORT.en.progress.queued(1)).toBe('Queued, with 1 scan ahead')
    expect([1, 2, 3, 12, 100].map((n) => REPORT.ar.engines.requests(n))).toEqual([
      'طلب واحد',
      'طلبان',
      '3 طلبات',
      '12 طلباً',
      '100 طلب',
    ])
  })

  it('names as many browsers as the scan rendered in', () => {
    expect([1, 2, 3].map((n) => REPORT.ar.engines.title(n))).toEqual([
      'الصفحة في متصفح واحد',
      'الصفحة في متصفحين',
      'الصفحة في ثلاثة متصفحات',
    ])
    expect([1, 2, 3].map((n) => REPORT.en.engines.title(n))).toEqual([
      'The page in one browser',
      'The page in two browsers',
      'The page in three browsers',
    ])
  })
})
