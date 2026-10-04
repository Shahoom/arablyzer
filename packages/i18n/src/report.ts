import type { Copy } from './copy'
import { arabicCount, englishCount, englishForm, REQUESTS, RULES_NOMINATIVE } from './plural'
import type { ArabicForms } from './plural'

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
  /**
   * Google Search Console, connected from a finished report (account-free, nothing stored): the
   * card's words, in both languages. Google's own words (coverage state) are shown as they come.
   */
  readonly gsc: {
    readonly title: string
    readonly intro: string
    readonly connect: string
    readonly privacy: string
    readonly loading: string
    readonly denied: string
    readonly failed: string
    readonly retry: string
    readonly noProperty: string
    readonly tryAnother: string
    readonly partial: string
    readonly clear: string
    readonly shownOnce: string
    readonly property: string
    readonly period: (start: string, end: string) => string
    readonly totals: {
      readonly clicks: string
      readonly impressions: string
      readonly ctr: string
      readonly position: string
      readonly none: string
    }
    readonly lists: {
      readonly queries: string
      readonly pages: string
      readonly countries: string
      readonly none: string
    }
    readonly rowDetail: (clicks: string, impressions: string) => string
    readonly inspection: {
      readonly title: string
      readonly none: string
      readonly verdict: string
      readonly verdicts: {
        readonly pass: string
        readonly partial: string
        readonly fail: string
        readonly neutral: string
        readonly unknown: string
      }
      readonly coverage: string
      readonly lastCrawl: string
      readonly googleCanonical: string
      readonly userCanonical: string
      readonly canonicalDiffers: string
      readonly mobile: string
      readonly mobileVerdicts: {
        readonly pass: string
        readonly fail: string
        readonly unknown: string
      }
    }
  }
  readonly header: {
    readonly kicker: string
    readonly scannedOn: string
    /** The domain's authority from Open PageRank, in the line under the address. */
    readonly authority: string
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
    /** The categories no rule applied to. */
    readonly none: string
    readonly methodology: string
  }
  readonly contents: {
    /** The browsers' list, when none rendered the page. */
    readonly engines: string
  }
  readonly engines: {
    /** The engines the scan rendered in: one to three. */
    readonly title: (count: number) => string
    readonly requests: (count: number) => string
    /** An engine that shows a problem the others do not. */
    readonly alone: string
  }
  readonly findings: {
    readonly none: string
    /** Some rules could not run: those that did found nothing, which is not a clean page. */
    readonly noneIncomplete: string
    /** No rule could run: the report cannot say whether the page has problems. */
    readonly noneUnknown: string
    readonly selector: string
    readonly seenIn: string
    readonly fix: string
    readonly notDeducted: string
    readonly review: string
    readonly more: (count: number) => string
    readonly overflow: (overflow: number, viewport: number) => string
  }
  readonly passed: { readonly title: string; readonly notApplicable: string }
  /** The severity filter over the findings. */
  readonly tabs: { readonly filter: string }
  readonly notices: string
  /** Said to a screen reader when the report replaces the progress. */
  readonly ready: string
  /** When a scan does not go as it should (the approved States design). */
  readonly states: {
    readonly blocked: { readonly title: string; readonly text: (status: string) => string }
    /** The site's robots.txt asks ArablyzerBot not to check the page (M2.4 plan §2). */
    readonly optedOut: { readonly title: string; readonly text: string }
    readonly partial: {
      readonly title: string
      readonly text: string
      /** A tool's result, which has no score. */
      readonly tool: string
    }
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
  /**
   * The report under the scanned address (M2.6, R4 and R7): the line that says what was read, the
   * summary, the findings, the form that scans another page.
   */
  readonly thread: {
    /** The collapsible line: what the scan read, and how many rules ran on it. */
    readonly read: {
      /** The engines it rendered in, named: «Chromium وFirefox». */
      readonly rendered: (engines: string, rules: number) => string
      /** No browser rendered the page: it was read as the server sends it. */
      readonly html: (rules: number) => string
    }
    readonly summary: {
      /** Problems and notes, counted: «مشكلتان وملاحظة واحدة في هذه الصفحة». */
      readonly counts: (problems: number, notes: number) => string
      /** Only checks that need a review. */
      readonly review: (count: number) => string
      /** Every rule finished, and none found a problem. */
      readonly clean: string
      /** Some rules did not finish, and those that did found no problem. */
      readonly incomplete: string
      /** No rule finished. */
      readonly unknown: string
      /** What passed and what did not apply, in a sentence; empty when both are zero. */
      readonly checks: (passed: number, notApplicable: number) => string
      /** Under the score's number. */
      readonly outOf: string
    }
    readonly categories: {
      readonly title: string
      /** Before the categories that score 100. */
      readonly full: string
    }
    readonly findings: {
      readonly title: string
      /** A problem only one of the browsers shows. */
      readonly only: (engine: string) => string
      /** The link to the rule's page. */
      readonly about: string
    }
    /** The form at the end of the report: scanning another page. */
    readonly dock: {
      /** Its heading. */
      readonly title: string
      readonly label: string
      readonly submit: string
    }
    /** The scan box while a scan runs: where it is of how many steps. */
    readonly stepOf: (step: number, of: number) => string
  }
}

/** A rule the scan ran, as the object of «شغّلنا»: «قاعدتين»، «3 قواعد». */
const RULES_ACCUSATIVE: ArabicForms = {
  one: 'قاعدة واحدة',
  two: 'قاعدتين',
  few: '{n} قواعد',
  many: '{n} قاعدة',
}
const PROBLEMS: ArabicForms = {
  one: 'مشكلة واحدة',
  two: 'مشكلتان',
  few: '{n} مشكلات',
  many: '{n} مشكلة',
}
const NOTES: ArabicForms = {
  one: 'ملاحظة واحدة',
  two: 'ملاحظتان',
  few: '{n} ملاحظات',
  many: '{n} ملاحظة',
}
/** A check that needs a human eye, as the subject of its sentence. */
const REVIEWS: ArabicForms = {
  one: 'فحص واحد يحتاج عين إنسان',
  two: 'فحصان يحتاجان عين إنسان',
  few: '{n} فحوص تحتاج عين إنسان',
  many: '{n} فحصاً يحتاج عين إنسان',
}
/** «نجح 21 فحصاً»: the verb agrees with the count, as in speech. */
const PASSED: ArabicForms = {
  one: 'نجح فحص واحد',
  two: 'نجح فحصان',
  few: 'نجحت {n} فحوص',
  many: 'نجح {n} فحصاً',
}
const NOT_APPLICABLE: ArabicForms = {
  one: 'ولا ينطبق فحص واحد على هذه الصفحة',
  two: 'ولا ينطبق فحصان على هذه الصفحة',
  few: 'ولا تنطبق {n} فحوص على هذه الصفحة',
  many: 'ولا ينطبق {n} فحصاً على هذه الصفحة',
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
      scannedOn: 'فُحصت في',
      authority: 'قوة النطاق',
      rules: 'القواعد',
      noindex: 'لا يظهر في محركات البحث',
      copyLink: 'انسخ الرابط',
      copied: 'نُسخ الرابط',
      json: 'JSON',
      rescan: 'أعد الفحص',
      tool: 'نتيجة أداة',
    },
    gsc: {
      title: 'ما يعرفه Google عن موقعك',
      intro:
        'اربط حسابك في Google Search Console ليظهر هنا ما يعرفه Google عن موقعك: النقرات والظهور وأهم عبارات البحث والصفحات، وحال فهرسة هذه الصفحة.',
      connect: 'اربط Search Console',
      privacy:
        'قراءة فقط. نقرأ البيانات مرة واحدة ونعرضها هنا، ولا نحفظ منها شيئاً، ولا نحتفظ برمز الدخول.',
      loading: 'نقرأ بياناتك من Search Console…',
      denied: 'لم تسمح بالوصول، فلم نقرأ شيئاً. يمكنك المحاولة مرة أخرى متى شئت.',
      failed: 'تعذّرت قراءة Search Console. جرّب مرة أخرى بعد قليل.',
      retry: 'حاول مرة أخرى',
      noProperty:
        'ليس في هذا الحساب موقع في Search Console يطابق هذه الصفحة. أضف الموقع إلى Search Console وأثبت ملكيته، أو اربط حساباً آخر يملكه.',
      tryAnother: 'اربط حساباً آخر',
      partial: 'لم يعطِنا Google بعض البيانات، فنعرض ما وصلنا منها.',
      clear: 'أخفِ هذه البيانات',
      shownOnce: 'تُعرض هذه البيانات مرة واحدة في هذه الصفحة؛ وإعادة تحميلها تمحوها.',
      property: 'الموقع في Search Console',
      period: (start, end) => `آخر 28 يوماً، من ${start} إلى ${end}`,
      totals: {
        clicks: 'النقرات',
        impressions: 'مرات الظهور',
        ctr: 'نسبة النقر',
        position: 'متوسط الترتيب',
        none: 'لا بيانات بحث لهذا الموقع في هذه المدة.',
      },
      lists: {
        queries: 'أهم عبارات البحث',
        pages: 'أهم الصفحات',
        countries: 'النقرات حسب البلد',
        none: 'لا بيانات.',
      },
      rowDetail: (clicks, impressions) => `${clicks} نقرة من ${impressions} ظهور`,
      inspection: {
        title: 'حال هذه الصفحة عند Google',
        none: 'لم يعطِنا Google فحص هذه الصفحة.',
        verdict: 'الفهرسة',
        verdicts: {
          pass: 'الصفحة على Google',
          partial: 'مفهرسة جزئياً',
          fail: 'الصفحة ليست على Google',
          neutral: 'مستثناة من الفهرسة',
          unknown: 'غير معروف',
        },
        coverage: 'حالة التغطية',
        lastCrawl: 'آخر زحف',
        googleCanonical: 'الرابط الأساسي الذي اختاره Google',
        userCanonical: 'الرابط الأساسي الذي أعلنته الصفحة',
        canonicalDiffers: 'اختار Google رابطاً أساسياً غير الذي أعلنته الصفحة',
        mobile: 'سهولة الاستعمال على الجوال',
        mobileVerdicts: {
          pass: 'مناسبة للجوال',
          fail: 'فيها مشكلات على الجوال',
          unknown: 'غير معروف',
        },
      },
    },
    score: {
      none: 'لا قواعد تنطبق',
      methodology: 'كيف حُسبت الدرجة؟ المنهجية',
    },
    contents: { engines: 'المتصفحات' },
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
      none: 'لم تجد القواعد أي مشكلة.',
      noneIncomplete:
        'لم تجد القواعد التي اكتملت أي مشكلة، لكن بعضها لم يكتمل، فلا نقول إن الصفحة بلا مشاكل.',
      noneUnknown: 'لم تكتمل أي قاعدة، فلا نعرف إن كانت في الصفحة مشاكل.',
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
    tabs: { filter: 'حسب الخطورة' },
    notices: 'تنبيهات',
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
        tool: 'بعض الفحوص لم تكتمل، والتقرير يسمّي ما لم يعمل.',
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
    thread: {
      read: {
        rendered: (engines, rules) =>
          `قرأنا الصفحة في ${engines}، وشغّلنا ${arabicCount(rules, RULES_ACCUSATIVE)}`,
        html: (rules) =>
          `قرأنا الصفحة كما يرسلها الخادم، وشغّلنا ${arabicCount(rules, RULES_ACCUSATIVE)}`,
      },
      summary: {
        counts: (problems, notes) => {
          const parts = []
          if (problems > 0) parts.push(arabicCount(problems, PROBLEMS))
          if (notes > 0) parts.push(arabicCount(notes, NOTES))
          return `${parts.join(' و')} في هذه الصفحة`
        },
        review: (count) => arabicCount(count, REVIEWS),
        clean: 'لا مشاكل في هذه الصفحة',
        incomplete: 'لم نجد مشكلة، لكن الفحص لم يكتمل',
        unknown: 'لا نعرف إن كانت في الصفحة مشاكل',
        checks: (passed, notApplicable) => {
          if (passed === 0 && notApplicable === 0) return ''
          const parts = [passed === 0 ? 'لم ينجح أي فحص' : arabicCount(passed, PASSED)]
          if (notApplicable > 0) parts.push(arabicCount(notApplicable, NOT_APPLICABLE))
          return `${parts.join('، ')}.`
        },
        outOf: 'من 100',
      },
      categories: { title: 'حسب الفئة', full: 'درجتها 100' },
      findings: {
        title: 'ما وجدناه',
        only: (engine) => `في ${engine} وحده`,
        about: 'عن هذه القاعدة',
      },
      dock: {
        title: 'افحص صفحة أخرى',
        label: 'رابط صفحة أخرى',
        submit: 'افحص',
      },
      stepOf: (step, of) => `الخطوة ${step} من ${of}`,
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
      scannedOn: 'Scanned on',
      authority: 'Domain authority',
      rules: 'Rules',
      noindex: 'Not in search engines',
      copyLink: 'Copy link',
      copied: 'Link copied',
      json: 'JSON',
      rescan: 'Scan again',
      tool: 'A tool’s result',
    },
    gsc: {
      title: 'What Google knows about your site',
      intro:
        'Connect your Google Search Console account to see here what Google knows about your site: clicks, impressions, top queries and pages, and how Google indexed this page.',
      connect: 'Connect Search Console',
      privacy:
        'Read-only. We read the data once and show it here. We store none of it, and we do not keep the access token.',
      loading: 'Reading your Search Console data…',
      denied: 'You did not allow access, so nothing was read. You can try again whenever you like.',
      failed: 'We could not read Search Console. Try again in a moment.',
      retry: 'Try again',
      noProperty:
        'This account has no Search Console property that matches this page. Add the site to Search Console and verify it, or connect an account that owns it.',
      tryAnother: 'Connect another account',
      partial: 'Google did not give us some of the data, so this shows what arrived.',
      clear: 'Hide this data',
      shownOnce: 'This data is shown once on this page; reloading the page clears it.',
      property: 'Search Console property',
      period: (start, end) => `Last 28 days, ${start} to ${end}`,
      totals: {
        clicks: 'Clicks',
        impressions: 'Impressions',
        ctr: 'Click-through rate',
        position: 'Average position',
        none: 'No search data for this site in this period.',
      },
      lists: {
        queries: 'Top queries',
        pages: 'Top pages',
        countries: 'Clicks by country',
        none: 'No data.',
      },
      rowDetail: (clicks, impressions) => `${clicks} clicks from ${impressions} impressions`,
      inspection: {
        title: 'This page at Google',
        none: 'Google did not give us an inspection of this page.',
        verdict: 'Indexing',
        verdicts: {
          pass: 'The page is on Google',
          partial: 'Partly indexed',
          fail: 'The page is not on Google',
          neutral: 'Excluded from indexing',
          unknown: 'Unknown',
        },
        coverage: 'Coverage state',
        lastCrawl: 'Last crawl',
        googleCanonical: 'Canonical Google chose',
        userCanonical: 'Canonical the page declares',
        canonicalDiffers: 'Google chose a different canonical from the one the page declares',
        mobile: 'Mobile usability',
        mobileVerdicts: {
          pass: 'Usable on mobile',
          fail: 'Has problems on mobile',
          unknown: 'Unknown',
        },
      },
    },
    score: {
      none: 'No rule applies',
      methodology: 'How is the score computed? The methodology',
    },
    contents: { engines: 'Browsers' },
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
      none: 'The rules found no problems.',
      noneIncomplete:
        'The rules that finished found no problems, but some did not finish, so we do not say the page has none.',
      noneUnknown: 'No rule finished, so we cannot say whether the page has problems.',
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
    tabs: { filter: 'By severity' },
    notices: 'Notices',
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
        tool: 'Some checks did not finish, and the report names what did not.',
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
    thread: {
      read: {
        rendered: (engines, rules) =>
          `We read the page in ${engines}, and ran ${englishCount(rules, 'rule', 'rules')}`,
        html: (rules) =>
          `We read the page as the server sends it, and ran ${englishCount(rules, 'rule', 'rules')}`,
      },
      summary: {
        counts: (problems, notes) => {
          const parts = []
          if (problems > 0) parts.push(englishCount(problems, 'problem', 'problems'))
          if (notes > 0) parts.push(englishCount(notes, 'note', 'notes'))
          return `${parts.join(' and ')} on this page`
        },
        review: (count) =>
          `${count} ${englishForm(count, 'check needs', 'checks need')} a human eye`,
        clean: 'No problems on this page',
        incomplete: 'No problems found, but the scan did not finish',
        unknown: 'We cannot say whether this page has problems',
        checks: (passed, notApplicable) => {
          if (passed === 0 && notApplicable === 0) return ''
          const parts = [`${englishCount(passed, 'check', 'checks')} passed`]
          if (notApplicable > 0) parts.push(`${notApplicable} not applicable to this page`)
          return `${parts.join(', ')}.`
        },
        outOf: 'out of 100',
      },
      categories: { title: 'By category', full: 'Scoring 100' },
      findings: {
        title: 'What we found',
        only: (engine) => `Only in ${engine}`,
        about: 'About this rule',
      },
      dock: {
        title: 'Scan another page',
        label: 'URL of another page',
        submit: 'Scan',
      },
      stepOf: (step, of) => `Step ${step} of ${of}`,
    },
  },
}
