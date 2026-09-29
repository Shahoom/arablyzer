import type { Copy } from './copy'
import { arabicCount, englishCount, REQUESTS, RULES_NOMINATIVE } from './plural'

/** The report's categories, as report-schema names them. */
export const CATEGORIES = [
  'rtl',
  'ar-render',
  'ar-content',
  'forms',
  'onpage',
  'index',
  'crawl',
  'links',
  'intl',
  'locale',
  'speed',
  'trust',
  'schema',
  'commerce',
  'ai',
] as const
export type CategoryName = (typeof CATEGORIES)[number]

export type EngineState =
  'waiting' | 'rendering' | 'rendered' | 'failed' | 'timeout' | 'unavailable' | 'refused'

export interface ReportStrings {
  readonly meta: { readonly title: string; readonly description: string }
  /** Shown when the page runs without JavaScript. */
  readonly noscript: string
  readonly categories: Readonly<Record<CategoryName, string>>
  /** The scan while it runs (the approved Audit-Progress design). */
  readonly progress: {
    readonly kicker: string
    readonly title: string
    readonly engines: string
    readonly steps: {
      readonly page: string
      readonly robots: string
      readonly render: string
      readonly crux: string
      readonly rules: string
      readonly score: string
    }
    readonly queued: (ahead: number) => string
    readonly robots: Readonly<Record<'fetched' | 'unavailable' | 'unreachable' | 'failed', string>>
    readonly crux: Readonly<Record<'found' | 'not-found' | 'failed' | 'skipped', string>>
    readonly engine: Readonly<Record<EngineState, string>>
    readonly rules: (count: number) => string
    readonly note: string
    /** A step's state, for a screen reader: the page shows it by its box alone. */
    readonly state: Readonly<Record<'done' | 'active' | 'waiting' | 'failed', string>>
    /** Before the scan starts, when its engines are not known yet. */
    readonly waitingStart: string
    /** The page could not be fetched. */
    readonly pageFailed: string
  }
  readonly header: {
    readonly kicker: string
    readonly title: string
    readonly scannedOn: string
    readonly rules: string
    readonly noindex: string
    readonly copyLink: string
    readonly copied: string
    readonly json: string
    readonly rescan: string
    /** A tool page's scan (M2.2): its kicker, before the tool's slug. */
    readonly tool: string
  }
  readonly score: {
    readonly title: string
    readonly categories: string
    readonly none: string
    readonly methodology: string
  }
  readonly contents: {
    readonly title: string
    readonly findings: string
    readonly engines: string
    readonly passed: string
    readonly json: string
  }
  readonly engines: {
    /** The engines the scan rendered in: one to three. */
    readonly title: (count: number) => string
    readonly requests: (count: number) => string
    /** An engine that shows a problem the others do not. */
    readonly alone: string
  }
  readonly findings: {
    readonly title: string
    readonly none: string
    readonly selector: string
    readonly seenIn: string
    readonly fix: string
    readonly notDeducted: string
    readonly review: string
    readonly more: (count: number) => string
    readonly overflow: (overflow: number, viewport: number) => string
  }
  readonly passed: { readonly title: string; readonly notApplicable: string }
  /** The results' tabs, and the severity filter beside them. */
  readonly tabs: {
    readonly problems: string
    readonly pass: string
    readonly notApplicable: string
    readonly filter: string
  }
  readonly notices: string
  /** The results' section: the problems, the passed and the not-applicable rules. */
  readonly results: string
  /** A tab with no rule in it. */
  readonly noRules: string
  /** Said to a screen reader when the report replaces the progress. */
  readonly ready: string
  /** When a scan does not go as it should (the approved States design). */
  readonly states: {
    readonly blocked: { readonly title: string; readonly text: (status: string) => string }
    /** The site's robots.txt asks ArablyzerBot not to check the page (M2.4 plan §2). */
    readonly optedOut: { readonly title: string; readonly text: string }
    readonly partial: { readonly title: string; readonly text: string }
    readonly failed: {
      readonly title: string
      /** No report: the scan could not run. */
      readonly text: string
      /** A report that says why the page could not be scanned. */
      readonly why: string
    }
    readonly missing: { readonly title: string; readonly text: string }
    readonly offline: { readonly title: string; readonly text: string }
    readonly another: string
    readonly again: string
  }
}

export const REPORT: Copy<ReportStrings> = {
  reviewed: false,
  ar: {
    meta: {
      title: 'تقرير Arablyzer',
      description: 'تقرير فحص صفحة، برابط خاص لا يظهر في محركات البحث.',
    },
    noscript: 'التقرير يحتاج JavaScript: فعّله في متصفحك ثم حدّث الصفحة.',
    categories: {
      rtl: 'الاتجاه RTL',
      'ar-render': 'العرض العربي',
      'ar-content': 'المحتوى العربي',
      forms: 'النماذج',
      onpage: 'داخل الصفحة',
      index: 'الأرشفة',
      crawl: 'الزحف والوصول',
      links: 'الروابط',
      intl: 'اللغات والدول',
      locale: 'الإعدادات المحلية',
      speed: 'السرعة',
      trust: 'الثقة والأمان',
      schema: 'البيانات المنظّمة',
      commerce: 'التجارة',
      ai: 'بحث الذكاء الاصطناعي',
    },
    progress: {
      kicker: 'الفحص',
      title: 'نفحص صفحتك الآن',
      engines: 'كل متصفح في سياق جديد، خلف بوابة الحماية',
      steps: {
        page: 'جلب الصفحة',
        robots: 'قراءة robots.txt',
        render: 'العرض في المتصفحات',
        crux: 'سرعة الزوار الحقيقيين',
        rules: 'تشغيل القواعد',
        score: 'حساب الدرجة',
      },
      // The number last, so the noun needs no agreement with it.
      queued: (ahead) =>
        ahead === 0 ? 'في الطابور، وهو التالي' : `في الطابور، وعدد الفحوص قبلنا: ${ahead}`,
      robots: {
        fetched: 'قرأناه',
        unavailable: 'لا ملف، فالفحص مسموح',
        unreachable: 'تعذّر الوصول إليه',
        failed: 'تعذّر فحصه',
      },
      crux: {
        found: 'وجدنا بياناتها',
        'not-found': 'لا بيانات لها في CrUX',
        failed: 'تعذّر سؤال CrUX',
        skipped: 'لم نسأل: لا مفتاح لهذا الفحص',
      },
      engine: {
        waiting: 'ينتظر دوره',
        rendering: 'يعرض الصفحة',
        rendered: 'عُرضت',
        failed: 'تعذّر العرض',
        timeout: 'انتهى الوقت',
        unavailable: 'غير متاح',
        refused: 'لا يعمل هنا',
      },
      rules: (count) => arabicCount(count, RULES_NOMINATIVE),
      note: 'إن طال الفحص على صفحة ثقيلة، نعطيك تقريراً جزئياً ونقول بوضوح ما لم نستطع فحصه. والتقرير برابط خاص، لا يظهر في محركات البحث.',
      state: { done: 'اكتملت', active: 'جارية الآن', waiting: 'لم تبدأ', failed: 'تعذّرت' },
      waitingStart: 'بانتظار بدء الفحص',
      pageFailed: 'تعذّر جلبها',
    },
    header: {
      kicker: 'التقرير',
      title: 'تقرير الصفحة',
      scannedOn: 'فُحصت في',
      rules: 'القواعد',
      noindex: 'لا يظهر في محركات البحث',
      copyLink: 'انسخ الرابط',
      copied: 'نُسخ الرابط',
      json: 'JSON',
      rescan: 'أعد الفحص',
      tool: 'نتيجة أداة',
    },
    score: {
      title: 'الدرجة',
      categories: 'الفئات',
      none: 'لا قواعد تنطبق',
      methodology: 'كيف حُسبت الدرجة؟ المنهجية',
    },
    contents: {
      title: 'في هذا التقرير',
      findings: 'المخالفات',
      engines: 'المتصفحات',
      passed: 'فحوص نجحت',
      json: 'التفاصيل التقنية',
    },
    engines: {
      title: (count) =>
        count === 1
          ? 'الصفحة في متصفح واحد'
          : count === 2
            ? 'الصفحة في متصفحين'
            : 'الصفحة في ثلاثة متصفحات',
      requests: (count) => arabicCount(count, REQUESTS),
      alone: 'فيها مخالفة لا تظهر في غيرها',
    },
    findings: {
      title: 'المخالفات',
      none: 'لم تجد القواعد أي مشكلة.',
      selector: 'المحدِّد',
      seenIn: 'ظهرت في',
      fix: 'كيف تُصلح',
      notDeducted: 'لا تُخصم من الدرجة',
      review: 'تحتاج عين إنسان',
      more: (count) => `و${count} غيرها`,
      overflow: (overflow, viewport) =>
        `يتجاوز حافة شاشة عرضها ${viewport} بكسل بمقدار ${overflow} بكسل`,
    },
    passed: { title: 'فحوص نجحت', notApplicable: 'لا تنطبق على هذه الصفحة' },
    tabs: { problems: 'المخالفات', pass: 'نجحت', notApplicable: 'لا تنطبق', filter: 'حسب الخطورة' },
    notices: 'تنبيهات',
    results: 'النتائج',
    noRules: 'لا قواعد هنا.',
    ready: 'التقرير جاهز.',
    states: {
      blocked: {
        title: 'الموقع حجب الفحص',
        text: (status) =>
          `ردّ الموقع على ArablyzerBot بـ HTTP ${status}. لا نتجاوز حماية المواقع أبداً، فلم نفحص الصفحة.`,
      },
      optedOut: {
        title: 'طلب الموقع ألّا نفحصه',
        text: 'نحترم ما يطلبه الموقع، فلم نفحص الصفحة ولم نحفظ منها شيئاً. وإن كان الموقع موقعك، فاحذف القاعدة أدناه ثم أعد الفحص: نقرأ ملف robots.txt من جديد في كل فحص.',
      },
      partial: {
        title: 'تقرير جزئي',
        text: 'بعض الفحوص لم تكتمل. الدرجة محسوبة على القواعد التي عملت، والتقرير يسمّي ما لم يعمل.',
      },
      failed: {
        title: 'تعذّر الفحص',
        text: 'لم نستطع إكمال هذا الفحص، ولا تقرير له. أعد المحاولة بعد قليل.',
        why: 'لم نستطع فحص هذه الصفحة، وهذا ما حدث:',
      },
      missing: {
        title: 'لا تقرير بهذا الرابط',
        text: 'الرابط غير صحيح، أو انتهت مدة حفظ التقرير.',
      },
      offline: {
        title: 'تعذّر الوصول إلى خدمة الفحص',
        text: 'تواصل الصفحة المحاولة، وتعرض الفحص حين تجيب الخدمة.',
      },
      another: 'افحص صفحة أخرى',
      again: 'أعد الفحص',
    },
  },
  en: {
    meta: {
      title: 'Arablyzer report',
      description: 'A page scan report, at a private link that search engines never show.',
    },
    noscript: 'The report needs JavaScript: turn it on in your browser, then reload the page.',
    categories: {
      rtl: 'RTL direction',
      'ar-render': 'Arabic rendering',
      'ar-content': 'Arabic content',
      forms: 'Forms',
      onpage: 'On the page',
      index: 'Indexing',
      crawl: 'Crawling and access',
      links: 'Links',
      intl: 'Languages and countries',
      locale: 'Locale',
      speed: 'Speed',
      trust: 'Trust and security',
      schema: 'Structured data',
      commerce: 'Commerce',
      ai: 'AI search',
    },
    progress: {
      kicker: 'Scan',
      title: 'Scanning your page',
      engines: 'Each browser in a fresh context, behind the egress gate',
      steps: {
        page: 'Fetching the page',
        robots: 'Reading robots.txt',
        render: 'Rendering in browsers',
        crux: 'Real visitors’ speed',
        rules: 'Running the rules',
        score: 'Computing the score',
      },
      queued: (ahead) =>
        ahead === 0
          ? 'Queued, and next'
          : `Queued, with ${englishCount(ahead, 'scan', 'scans')} ahead`,
      robots: {
        fetched: 'Read',
        unavailable: 'No file, so crawling is allowed',
        unreachable: 'Could not be reached',
        failed: 'Could not be checked',
      },
      crux: {
        found: 'Data found',
        'not-found': 'No CrUX data for it',
        failed: 'CrUX could not be asked',
        skipped: 'Not asked: no key for this scan',
      },
      engine: {
        waiting: 'Waiting its turn',
        rendering: 'Rendering the page',
        rendered: 'Rendered',
        failed: 'Could not render',
        timeout: 'Ran out of time',
        unavailable: 'Not available',
        refused: 'Does not run here',
      },
      rules: (count) => englishCount(count, 'rule', 'rules'),
      note: 'If a heavy page takes too long, you get a partial report that says clearly what could not be checked. The report is at a private link, and never appears in search engines.',
      state: { done: 'done', active: 'in progress', waiting: 'not started', failed: 'failed' },
      waitingStart: 'Waiting for the scan to start',
      pageFailed: 'Could not be fetched',
    },
    header: {
      kicker: 'Report',
      title: 'Page report',
      scannedOn: 'Scanned on',
      rules: 'Rules',
      noindex: 'Not in search engines',
      copyLink: 'Copy link',
      copied: 'Link copied',
      json: 'JSON',
      rescan: 'Scan again',
      tool: 'A tool’s result',
    },
    score: {
      title: 'Score',
      categories: 'Categories',
      none: 'No rule applies',
      methodology: 'How is the score computed? The methodology',
    },
    contents: {
      title: 'In this report',
      findings: 'Problems',
      engines: 'Browsers',
      passed: 'Checks passed',
      json: 'Technical details',
    },
    engines: {
      title: (count) =>
        count === 1
          ? 'The page in one browser'
          : count === 2
            ? 'The page in two browsers'
            : 'The page in three browsers',
      requests: (count) => englishCount(count, 'request', 'requests'),
      alone: 'Shows a problem the others do not',
    },
    findings: {
      title: 'Problems',
      none: 'The rules found no problems.',
      selector: 'Selector',
      seenIn: 'Seen in',
      fix: 'How to fix',
      notDeducted: 'Not deducted from the score',
      review: 'Needs a human eye',
      more: (count) => `and ${count} more`,
      overflow: (overflow, viewport) =>
        `Reaches ${overflow} pixels past the edge of a ${viewport}-pixel screen`,
    },
    passed: { title: 'Checks passed', notApplicable: 'Not applicable to this page' },
    tabs: {
      problems: 'Problems',
      pass: 'Passed',
      notApplicable: 'Not applicable',
      filter: 'By severity',
    },
    notices: 'Notices',
    results: 'Results',
    noRules: 'No rules here.',
    ready: 'The report is ready.',
    states: {
      blocked: {
        title: 'The site blocked the scan',
        text: (status) =>
          `The site answered ArablyzerBot with HTTP ${status}. We never get around a site’s protection, so the page was not scanned.`,
      },
      optedOut: {
        title: 'The site asked not to be checked',
        text: 'We respect what the site asks, so the page was not checked, and nothing of it is kept. If the site is yours, remove the rule below and check again: every check reads robots.txt afresh.',
      },
      partial: {
        title: 'Partial report',
        text: 'Some checks did not finish. The score counts the rules that ran, and the report names what did not.',
      },
      failed: {
        title: 'The scan could not run',
        text: 'We could not finish this scan, and it has no report. Try again shortly.',
        why: 'We could not scan this page. This is what happened:',
      },
      missing: {
        title: 'No report at this link',
        text: 'The link is wrong, or the report is no longer kept.',
      },
      offline: {
        title: 'Cannot reach the scan service',
        text: 'The page keeps trying, and shows the scan as soon as the service answers.',
      },
      another: 'Check another page',
      again: 'Scan again',
    },
  },
}
