import { AUTH_ERROR_CODES, SCAN_ERROR_CODES } from '@arablyzer/api-contract/codes'
import { DEFAULT_POLICY } from '@arablyzer/egress'
import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_UI,
  ALL_COPY,
  CATEGORIES,
  codeParts,
  HERO_TOOLS,
  HOME,
  PAGES_UI,
  REPORT,
  SCAN_FORM,
  SITE,
  TOOL_APP,
  TOOLS_UI,
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
  hostsPerLoad: 50,
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
    hostsPerLoad: 41,
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

  // M1 review (issue #29): a page's scripts run in the bot's browsers, and they refuse whatever
  // sends data; the page says so, and how many hosts a browser may reach, from the code's number.
  it.each([
    [
      'en',
      [
        'sends nothing your page asks it to send',
        '`GET` or `HEAD`',
        'WebSocket',
        'sendBeacon',
        'POST',
      ],
    ],
    ['ar', ['لا يرسل ما تطلب صفحتك', '`GET` و`HEAD`', 'WebSocket', 'sendBeacon', 'POST']],
  ] as const)('says its browsers send no data a page asks them to, in %s', (lang, phrases) => {
    const never = PAGES_UI[lang].bot.never.items.join('\n')
    for (const phrase of phrases) expect(never, phrase).toContain(phrase)
  })

  it.each([
    ['en', '41 different hosts'],
    ['ar', '41 مضيفاً مختلفاً'],
  ] as const)('says how many hosts a browser may reach, in %s', (lang, phrase) => {
    expect(items(lang)).toContain(phrase)
  })

  it('counts the hosts as Arabic counts them', () => {
    const at = (hostsPerLoad: number) =>
      PAGES_UI.ar.bot.fetches.items({ ...numbers, hostsPerLoad }).join('\n')
    expect(at(1)).toContain('من مضيف واحد على الأكثر')
    expect(at(2)).toContain('من مضيفين مختلفين على الأكثر')
    expect(at(5)).toContain('من 5 مضيفين مختلفين على الأكثر')
    expect(at(50)).toContain('من 50 مضيفاً مختلفاً على الأكثر')
    expect(at(100)).toContain('من 100 مضيف مختلف على الأكثر')
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

  it('has words for every error the account routes can give, and the page’s own', () => {
    for (const lang of ['ar', 'en'] as const) {
      for (const code of [...AUTH_ERROR_CODES, 'network', 'unverified', 'cancelled', 'failed']) {
        expect(ACCOUNT_UI[lang].problems[code as keyof typeof ACCOUNT_UI.ar.problems]).toBeTruthy()
      }
    }
  })

  it('states no number on the account pages: they come from code, as the scan form’s do', () => {
    for (const lang of ['ar', 'en'] as const) {
      for (const [path, text] of leaves(ACCOUNT_UI[lang])) {
        expect(text, path).not.toMatch(/[0-9\u0660-\u0669]/)
      }
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

  // M5, issue #33: the address is stored as it is sent, with its query string, and its report opens
  // by its link alone. The owner's numbers (how long it is kept) are not the copy's to state.
  it('warns, in both languages, that the address is kept with its query string and shown in a report anyone with the link opens', () => {
    const { ar, en } = SCAN_FORM
    expect(en.queryNote).toMatch(/exactly as you send it/)
    expect(en.queryNote).toMatch(/after a “\?”/)
    expect(en.queryNote).toMatch(/anyone who has (the|its) (report’s )?link/i)
    expect(en.queryNote).toMatch(/token|key|personal data/i)
    expect(ar.queryNote).toMatch(/علامة الاستفهام/)
    expect(ar.queryNote).toMatch(/كل من يملك رابطه/)
    expect(ar.queryNote).toMatch(/مفاتيح|رموز|بيانات شخصية/)
  })

  it('states no number in that warning: how long a report is kept is the owner’s to say', () => {
    for (const text of [SCAN_FORM.ar.queryNote, SCAN_FORM.en.queryNote]) {
      expect(text).not.toMatch(/[0-9\u0660-\u0669]/)
      expect(text).not.toMatch(/days|hours|weeks|months|years|أيام|ساعات|أسابيع|أشهر|سنة|سنوات/i)
    }
  })

  it('says when to scan again, in whole minutes rounded up', () => {
    expect(SCAN_FORM.ar.retryAfter(30)).toBe('جرّب بعد دقيقة.')
    expect(SCAN_FORM.ar.retryAfter(120)).toBe('جرّب بعد دقيقتين.')
    expect(SCAN_FORM.ar.retryAfter(301)).toBe('جرّب بعد 6 دقائق.')
    expect(SCAN_FORM.ar.retryAfter(3600)).toBe('جرّب بعد 60 دقيقة.')
    expect(SCAN_FORM.en.retryAfter(61)).toBe('Try again in 2 minutes.')
    expect(SCAN_FORM.en.retryAfter(1)).toBe('Try again in 1 minute.')
  })

  it('names every tool of the hero’s chips, in both languages', () => {
    for (const tool of HERO_TOOLS) {
      expect(HOME.ar.hero.tools.names[tool]).toBeTruthy()
      expect(HOME.en.hero.tools.names[tool]).toBeTruthy()
    }
    expect(Object.keys(HOME.ar.hero.tools.names).sort()).toEqual([...HERO_TOOLS].sort())
  })

  // M2.6 R2: the home page's numbers are counted from the registries, so the words that follow a
  // number must agree with it as each language counts: «3 قواعد»، «11 قاعدة»، «قاعدتان».
  it('agrees the nouns of the home page’s counts with their numbers, as Arabic counts', () => {
    const { counts, hero, marquee } = HOME.ar
    expect([1, 2, 3, 11, 44, 100].map((n) => counts.tools(n))).toEqual([
      'أداة مجانية',
      'أداتان مجانيتان',
      'أدوات مجانية',
      'أداة مجانية',
      'أداة مجانية',
      'أداة مجانية',
    ])
    expect(counts.rules(61)).toBe('قاعدة نفحص بها')
    expect(counts.rules(2)).toBe('قاعدتان نفحص بهما')
    expect(counts.browsers(3)).toBe('متصفحات لكل صفحة')
    expect(counts.guides(15)).toBe('دليلاً لرسائل Search Console')
    expect(counts.guides(5)).toBe('أدلة لرسائل Search Console')
    expect(counts.terms(38)).toBe('مصطلحاً بالعربية')
    expect(counts.terms(1)).toBe('مصطلح بالعربية')
    expect(hero.pill.count(44)).toBe('44 أداة')
    expect(hero.pill.count(5)).toBe('5 أدوات')
    expect(hero.scope.rules(61)).toBe('61 قاعدة')
    expect(marquee.label(44)).toBe('من أدواتنا (44 أداة)')
    expect(HOME.ar.figure.declarations(5)).toBe('في 5 خصائص من ملف CSS واحد')
    expect(HOME.ar.figure.declarations(2)).toBe('في خاصيتين من ملف CSS واحد')
    expect(HOME.ar.figure.float.passed(21)).toBe('نجحت 21 قاعدة')
    expect(HOME.ar.figure.float.skipped(37)).toBe('ولم تنطبق 37 قاعدة على الصفحة')
  })

  it('agrees the nouns of the home page’s counts with their numbers, in English', () => {
    const { counts, hero } = HOME.en
    expect(counts.tools(1)).toBe('free tool')
    expect(counts.tools(44)).toBe('free tools')
    expect(counts.browsers(3)).toBe('browsers for every page')
    expect(hero.pill.count(44)).toBe('44 tools')
    expect(hero.pill.count(1)).toBe('1 tool')
    expect(hero.scope.rules(61)).toBe('61 rules')
    expect(HOME.en.figure.declarations(1)).toBe('In 1 declaration of one CSS file')
    expect(HOME.en.figure.float.skipped(37)).toBe('37 rules did not apply to the page')
  })

  // The paid plans have no price yet, and the page must not look as if they had one: no currency
  // and no «per month» in the plans, in either language, and no number in a paid plan's words.
  it('gives the plans no price', () => {
    for (const plans of [HOME.ar.plans, HOME.en.plans]) {
      const words = JSON.stringify(plans, (_key, value: unknown) =>
        typeof value === 'function' ? (value as (n: number) => string)(44) : value,
      )
      expect(words).not.toMatch(
        /[$€£]|\b(?:USD|SAR|OMR|AED)\b|ريال|درهم|دينار|\/ ?(?:mo|month)\b|شهرياً|monthly/i,
      )
      for (const paid of [plans.monitoring, plans.crawl]) {
        expect(JSON.stringify(paid)).not.toMatch(/[0-9٠-٩]/)
      }
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

describe('a tool page’s v2 words', () => {
  it('names each kind of tool its card can show, and the fold of its methodology', () => {
    for (const lang of ['ar', 'en'] as const) {
      expect(Object.keys(TOOLS_UI[lang].kinds).sort(), lang).toEqual(['generator', 'paste', 'scan'])
      expect(TOOLS_UI[lang].page.measure, lang).toBeTruthy()
    }
    expect(TOOLS_UI.ar.page.measure).toBe('كيف نقيس')
    expect(TOOLS_UI.en.page.measure).toBe('How we measure')
  })

  // M2.6 R7: the box is a small label, the field and the button; what the tool reads is one line of
  // meta text, and the fine print is ScanNote's: one line and a disclosure of what is kept.
  it('says what a tool reads on one line, and where the DNS tool sends the domain', () => {
    for (const lang of ['ar', 'en'] as const) {
      const form = TOOL_APP[lang].form
      expect(form.reads, lang).toBeTruthy()
      expect(form.rendersIn, lang).toBeTruthy()
      expect(form.sentOut.dns, lang).toMatch(/Cloudflare/)
      expect(form.sentOut.dns, lang).toMatch(/SPF/)
      expect(form.sentOut.dns, lang).toMatch(/DMARC/)
    }
    expect(TOOL_APP.ar.form.reads).toBe('يقرأ:')
    expect(TOOL_APP.en.form.reads).toBe('Reads:')
    // The resolver gets the domain's name, which the words say, and nothing else of the page.
    expect(TOOL_APP.ar.form.sentOut.dns).toMatch(/اسم النطاق/)
    expect(TOOL_APP.en.form.sentOut.dns).toMatch(/domain’s name/)
  })

  it('says the fine print of a scan box as a line and a question that opens what is kept', () => {
    expect(SCAN_FORM.ar.note).toEqual({ free: 'مجاني وبلا تسجيل.', keepTitle: 'ماذا نحفظ؟' })
    expect(SCAN_FORM.en.note).toEqual({ free: 'Free, no sign-up.', keepTitle: 'What we keep' })
    // The line is short, and the disclosure's body is the warning about the address, in full.
    for (const lang of ['ar', 'en'] as const) {
      expect(SCAN_FORM[lang].note.free.length, lang).toBeLessThan(30)
      expect(SCAN_FORM[lang].queryNote.length, lang).toBeGreaterThan(80)
    }
  })

  it('names the list of a tool page’s sections, in the aside of a wide screen', () => {
    expect(TOOLS_UI.ar.page.contents).toBe('في هذه الصفحة')
    expect(TOOLS_UI.en.page.contents).toBe('On this page')
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

  // M2.6 R4: the report's headline counts problems and notes, and its line says what ran.
  it('counts the problems and notes of the summary as each language counts', () => {
    const ar = REPORT.ar.thread.summary
    expect(ar.counts(2, 1)).toBe('مشكلتان وملاحظة واحدة في هذه الصفحة')
    expect(ar.counts(1, 0)).toBe('مشكلة واحدة في هذه الصفحة')
    expect(ar.counts(0, 2)).toBe('ملاحظتان في هذه الصفحة')
    expect(ar.counts(3, 12)).toBe('3 مشكلات و12 ملاحظة في هذه الصفحة')
    expect(ar.counts(11, 100)).toBe('11 مشكلة و100 ملاحظة في هذه الصفحة')
    const en = REPORT.en.thread.summary
    expect(en.counts(2, 1)).toBe('2 problems and 1 note on this page')
    expect(en.counts(1, 0)).toBe('1 problem on this page')
    expect(en.counts(0, 3)).toBe('3 notes on this page')
  })

  it('says how many checks passed and did not apply, and nothing when neither did', () => {
    const ar = REPORT.ar.thread.summary.checks
    expect(ar(21, 37)).toBe('نجح 21 فحصاً، ولا ينطبق 37 فحصاً على هذه الصفحة.')
    expect(ar(1, 2)).toBe('نجح فحص واحد، ولا ينطبق فحصان على هذه الصفحة.')
    expect(ar(5, 0)).toBe('نجحت 5 فحوص.')
    expect(ar(0, 4)).toBe('لم ينجح أي فحص، ولا تنطبق 4 فحوص على هذه الصفحة.')
    expect(ar(0, 0)).toBe('')
    const en = REPORT.en.thread.summary.checks
    expect(en(21, 37)).toBe('21 checks passed, 37 not applicable to this page.')
    expect(en(1, 0)).toBe('1 check passed.')
    expect(en(0, 0)).toBe('')
  })

  it('counts the checks that need a review, with the verb that agrees', () => {
    const ar = REPORT.ar.thread.summary.review
    expect([1, 2, 3, 12].map(ar)).toEqual([
      'فحص واحد يحتاج عين إنسان',
      'فحصان يحتاجان عين إنسان',
      '3 فحوص تحتاج عين إنسان',
      '12 فحصاً يحتاج عين إنسان',
    ])
    expect(REPORT.en.thread.summary.review(1)).toBe('1 check needs a human eye')
    expect(REPORT.en.thread.summary.review(4)).toBe('4 checks need a human eye')
  })

  it('says what was read and how many rules ran, the object of «شغّلنا» in the accusative', () => {
    const ar = REPORT.ar.thread.read
    expect(ar.rendered('Chromium وFirefox وWebKit', 61)).toBe(
      'قرأنا الصفحة في Chromium وFirefox وWebKit، وشغّلنا 61 قاعدة',
    )
    expect(ar.rendered('Chromium', 2)).toBe('قرأنا الصفحة في Chromium، وشغّلنا قاعدتين')
    expect(ar.html(3)).toBe('قرأنا الصفحة كما يرسلها الخادم، وشغّلنا 3 قواعد')
    expect(REPORT.en.thread.read.rendered('Chromium, Firefox, and WebKit', 1)).toBe(
      'We read the page in Chromium, Firefox, and WebKit, and ran 1 rule',
    )
    expect(REPORT.en.thread.read.html(12)).toBe(
      'We read the page as the server sends it, and ran 12 rules',
    )
  })

  it('counts the steps of a scan', () => {
    expect(REPORT.ar.thread.stepOf(3, 5)).toBe('الخطوة 3 من 5')
    expect(REPORT.en.thread.stepOf(3, 5)).toBe('Step 3 of 5')
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
