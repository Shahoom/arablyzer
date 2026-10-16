import type { Copy } from './copy'
import { arabicCount, englishCount, type ArabicForms } from './plural'

/** The pages of the signed-in dashboard (M4.9), as the address names them. */
export type AppNav =
  'overview' | 'sites' | 'scans' | 'monitoring' | 'crawls' | 'pdfs' | 'keys' | 'brand' | 'account'

export interface PageWords {
  readonly title: string
  readonly lead: string
}

export interface AppStrings {
  readonly shell: {
    readonly skip: string
    readonly noscript: string
    readonly appName: string
    readonly sidebar: string
    readonly bottomBar: string
    readonly more: string
    readonly collapse: string
    readonly expand: string
    readonly closeMenu: string
    readonly loading: string
    readonly toLogin: string
    readonly off: string
    readonly failed: string
    readonly retry: string
    readonly crumbs: string
    readonly theme: { readonly toDark: string; readonly toLight: string }
    readonly user: {
      readonly menu: string
      readonly language: string
      readonly signOut: string
      readonly signOutEverywhere: string
    }
    readonly switcher: {
      readonly label: string
      readonly all: string
      readonly none: string
      readonly add: string
    }
    readonly search: {
      readonly open: string
      readonly placeholder: string
      readonly title: string
      readonly pages: string
      readonly sites: string
      readonly scans: string
      readonly none: (query: string) => string
      readonly hint: string
      readonly close: string
    }
    readonly plan: {
      readonly title: string
      readonly text: (used: number, limit: number) => string
      readonly compare: string
    }
  }
  readonly nav: {
    readonly groups: Readonly<Record<'main' | 'follow' | 'build' | 'account', string>>
    readonly items: Readonly<Record<AppNav, string>>
  }
  readonly pages: Readonly<Record<AppNav | 'site', PageWords>>
  readonly common: {
    readonly scanNow: string
    readonly scanning: string
    readonly open: string
    readonly openReport: string
    readonly viewAll: string
    readonly score: string
    readonly noScore: string
    readonly neverScanned: string
    readonly loading: string
    readonly failed: string
    readonly retry: string
    readonly monitored: string
    readonly notMonitored: string
    readonly paused: string
    readonly failing: string
    readonly of: (used: number, limit: number) => string
    readonly sitesCount: (n: number) => string
    readonly scansCount: (n: number) => string
    readonly alertsCount: (n: number) => string
    readonly issuesCount: (n: number) => string
    readonly delta: (change: number) => string
    readonly severities: Readonly<
      Record<'critical' | 'serious' | 'moderate' | 'minor' | 'info', string>
    >
    readonly trendLabel: (url: string, scores: string) => string
    readonly unavailable: string
  }
  readonly overview: {
    readonly hello: (name: string) => string
    readonly helloPlain: string
    readonly summary: (sites: number, monitored: number) => string
    readonly summaryEmpty: string
    readonly quick: {
      readonly label: string
      readonly placeholder: string
      readonly button: string
      readonly working: string
    }
    readonly kpis: {
      readonly average: string
      readonly averageNote: (scanned: number) => string
      readonly scanned: string
      readonly scannedNote: (total: number) => string
      readonly monitored: string
      readonly monitoredNote: (limit: number) => string
      readonly alerts: string
      readonly alertsNote: string
      readonly alertsNone: string
    }
    readonly sitesTitle: string
    readonly usageTitle: string
    readonly usageLead: string
    readonly meters: Readonly<Record<'sites' | 'monitored' | 'pdfs' | 'keys', string>>
    readonly meterFull: string
    readonly alertsTitle: string
    readonly alertsEmpty: string
    readonly alertsOff: string
    readonly alertKinds: {
      readonly 'score-drop': (from: number, to: number) => string
      readonly critical: (count: number) => string
      readonly down: string
    }
    readonly recentTitle: string
    readonly recentEmpty: string
    readonly start: {
      readonly title: string
      readonly progress: (done: number, total: number) => string
      readonly steps: Readonly<Record<'site' | 'scan' | 'monitor' | 'key', string>>
    }
  }
  readonly sites: {
    readonly searchLabel: string
    readonly searchPlaceholder: string
    readonly filters: Readonly<Record<'all' | 'monitored' | 'unmonitored', string>>
    readonly sortLabel: string
    readonly sorts: Readonly<Record<'recent' | 'worst' | 'name', string>>
    readonly columns: Readonly<
      Record<'site' | 'score' | 'trend' | 'monitoring' | 'last' | 'actions', string>
    >
    readonly addTitle: string
    readonly none: (query: string) => string
    readonly emptyTitle: string
    readonly emptyText: string
    readonly limit: (limit: number) => string
    readonly removeConfirm: (url: string) => string
    readonly removeYes: string
    readonly removeNo: string
    readonly actionsFor: (url: string) => string
  }
  readonly site: {
    readonly back: string
    readonly missing: string
    readonly missingText: string
    readonly last: (when: string) => string
    readonly monitoring: Readonly<Record<'on' | 'paused' | 'off', string>>
    readonly kpi: {
      readonly score: string
      readonly issues: string
      readonly issuesNote: (notes: number) => string
      readonly issuesNone: string
      readonly pages: string
      readonly pagesNote: (templates: number) => string
      readonly pagesNone: string
      readonly weakest: string
      readonly weakestNone: string
      readonly fromOutOf: string
    }
    readonly chart: {
      readonly title: string
      readonly lead: (days: number) => string
      readonly hint: string
      readonly readout: (date: string, score: string) => string
      readonly noScore: string
      readonly empty: string
      readonly unreached: string
    }
    readonly donut: {
      readonly title: string
      readonly lead: string
      readonly total: string
      readonly clean: string
      readonly loading: string
      readonly none: string
      readonly summary: (parts: string) => string
    }
    readonly categories: {
      readonly title: string
      readonly lead: string
      readonly none: string
      readonly fullNote: (count: number) => string
    }
    readonly crawl: {
      readonly title: string
      readonly none: string
      readonly templates: string
      readonly pages: (found: number, checked: number) => string
      readonly open: string
    }
    readonly monitor: { readonly title: string }
    readonly history: { readonly title: string; readonly none: string }
    readonly compareLast: string
    readonly compareNone: string
    readonly share: string
    readonly pdf: string
  }
  readonly scans: {
    readonly filters: {
      readonly search: string
      readonly searchPlaceholder: string
      readonly state: string
      readonly stateAll: string
      readonly site: string
      readonly siteAll: string
      readonly clear: string
    }
    readonly columns: Readonly<Record<'url' | 'state' | 'score' | 'when' | 'actions', string>>
    readonly showing: (from: number, to: number, total: number) => string
    readonly page: (page: number, pages: number) => string
    readonly previous: string
    readonly next: string
    readonly none: string
    readonly emptyTitle: string
    readonly emptyText: string
    readonly keptFor: (days: number) => string
  }
  readonly monitoring: {
    readonly columns: Readonly<Record<'site' | 'every' | 'next' | 'trend' | 'status', string>>
    readonly status: Readonly<Record<'ok' | 'paused' | 'failing', string>>
    readonly everyDays: (n: number) => string
    readonly emptyTitle: string
    readonly emptyText: string
    readonly limit: (used: number, limit: number) => string
    readonly turnOff: string
    readonly feedTitle: string
    readonly feedLead: string
    readonly feedEmpty: string
    readonly goSites: string
  }
  readonly crawls: {
    readonly emptyTitle: string
    readonly emptyText: string
    readonly cap: (pages: number) => string
    readonly latest: string
  }
  readonly account: {
    readonly profile: string
    readonly planTitle: string
    readonly planLead: string
    readonly planRows: Readonly<
      Record<
        | 'savedSites'
        | 'monitoredSites'
        | 'monitorEvery'
        | 'crawlPages'
        | 'pdfPerMonth'
        | 'apiKeys'
        | 'history',
        string
      >
    >
    readonly planValues: {
      readonly count: (n: number) => string
      readonly every: (days: number) => string
      readonly days: (n: number) => string
      readonly pages: (n: number) => string
      readonly none: string
    }
    readonly planNote: string
    readonly usageTitle: string
    readonly sessions: string
    readonly dangerTitle: string
  }
  readonly empty: {
    readonly addSite: string
  }
}

const SITES: ArabicForms = {
  one: 'موقع واحد',
  two: 'موقعان',
  few: '{n} مواقع',
  many: '{n} موقعاً',
  other: '{n} موقع',
}
const SCANS: ArabicForms = {
  one: 'فحص واحد',
  two: 'فحصان',
  few: '{n} فحوص',
  many: '{n} فحصاً',
  other: '{n} فحص',
}
const ALERTS: ArabicForms = {
  one: 'تنبيه واحد',
  two: 'تنبيهان',
  few: '{n} تنبيهات',
  many: '{n} تنبيهاً',
  other: '{n} تنبيه',
}
const ISSUES: ArabicForms = {
  one: 'مشكلة واحدة',
  two: 'مشكلتان',
  few: '{n} مشاكل',
  many: '{n} مشكلة',
  other: '{n} مشكلة',
}
const PAGES: ArabicForms = {
  one: 'صفحة واحدة',
  two: 'صفحتان',
  few: '{n} صفحات',
  many: '{n} صفحة',
  other: '{n} صفحة',
}
const DAYS: ArabicForms = {
  one: 'يوم واحد',
  two: 'يومان',
  few: '{n} أيام',
  many: '{n} يوماً',
  other: '{n} يوم',
}
const EVERY_DAYS: ArabicForms = {
  one: 'كل يوم',
  two: 'كل يومين',
  few: 'كل {n} أيام',
  many: 'كل {n} يوماً',
  other: 'كل {n} يوم',
}

/** «+5», «−3»: the real minus sign, Western digits. */
const signed = (change: number): string =>
  change === 0 ? '0' : `${change > 0 ? '+' : '−'}${String(Math.abs(change))}`

/**
 * The words of the signed-in dashboard (M4.9). Every number is a parameter, from the API's answers or
 * the page's own count; none is written here.
 */
export const APP_UI: Copy<AppStrings> = {
  reviewed: false,
  ar: {
    shell: {
      skip: 'انتقل إلى المحتوى',
      noscript: 'لوحتك تحتاج JavaScript: فعّله في متصفحك ثم حدّث الصفحة.',
      appName: 'Arablyzer، لوحة المستخدم',
      sidebar: 'القائمة الجانبية',
      bottomBar: 'التنقل',
      more: 'المزيد',
      collapse: 'اطوِ القائمة',
      expand: 'وسّع القائمة',
      closeMenu: 'أغلق القائمة',
      loading: 'نفتح لوحتك…',
      toLogin: 'ننقلك إلى تسجيل الدخول…',
      off: 'الحسابات غير مفعّلة في هذا الموقع. الفحص يعمل كالمعتاد بلا حساب.',
      failed: 'تعذّر فتح لوحتك الآن.',
      retry: 'أعد المحاولة',
      crumbs: 'مسار الصفحة',
      theme: { toDark: 'الوضع الداكن', toLight: 'الوضع الفاتح' },
      user: {
        menu: 'قائمة الحساب',
        language: 'اللغة',
        signOut: 'تسجيل الخروج',
        signOutEverywhere: 'الخروج من كل الأجهزة',
      },
      switcher: {
        label: 'الموقع',
        all: 'كل المواقع',
        none: 'لا مواقع بعد',
        add: 'أضف موقعاً',
      },
      search: {
        open: 'ابحث في مواقعك وفحوصك',
        placeholder: 'اذهب إلى موقع أو فحص أو صفحة…',
        title: 'اذهب إلى',
        pages: 'الصفحات',
        sites: 'المواقع',
        scans: 'الفحوص',
        none: (query) => `لا نتائج لـ«${query}».`,
        hint: 'ابحث بعنوان الموقع أو اسم الصفحة',
        close: 'أغلق البحث',
      },
      plan: {
        title: 'مواقعك المحفوظة',
        text: (used, limit) => `${used} من ${limit} في خطتك`,
        compare: 'قارن الخطط',
      },
    },
    nav: {
      groups: {
        main: 'لوحة المستخدم',
        follow: 'المتابعة',
        build: 'للمطوّرين والفرق',
        account: 'الحساب',
      },
      items: {
        overview: 'نظرة عامة',
        sites: 'مواقعي',
        scans: 'الفحوص',
        monitoring: 'المراقبة',
        crawls: 'الفحص العميق',
        pdfs: 'التقارير PDF',
        keys: 'مفاتيح API',
        brand: 'العلامة الخاصة',
        account: 'الحساب والخطة',
      },
    },
    pages: {
      overview: { title: 'نظرة عامة', lead: 'حال مواقعك اليوم، وما يحتاج انتباهك.' },
      sites: { title: 'مواقعي', lead: 'المواقع التي تتابعها: درجة كل موقع واتجاهها، وفحصه بنقرة.' },
      site: { title: 'الموقع', lead: 'درجات الموقع ومشاكله وفحوصه في صفحة واحدة.' },
      scans: { title: 'الفحوص', lead: 'كل فحص أجريته وأنت مسجّل الدخول، مع تقريره.' },
      monitoring: { title: 'المراقبة', lead: 'مواقع نفحصها عنك بانتظام، وأين تصلك التنبيهات.' },
      crawls: {
        title: 'الفحص العميق',
        lead: 'نزحف إلى موقعك كله ونجمع الصفحات في قوالب، فتصلح القالب مرة واحدة.',
      },
      pdfs: { title: 'التقارير PDF', lead: 'تقارير تنزّلها وترسلها لعميلك.' },
      keys: { title: 'مفاتيح API', lead: 'اربط Arablyzer بأدواتك وبمساعدك الذكي.' },
      brand: { title: 'العلامة الخاصة', lead: 'اسم شركتك وشعارها ولونها على تقاريرك.' },
      account: { title: 'الحساب والخطة', lead: 'بياناتك، وما تتيحه خطتك وما استهلكته منه.' },
    },
    common: {
      scanNow: 'افحص الآن',
      scanning: 'نبدأ الفحص…',
      open: 'افتح',
      openReport: 'افتح التقرير',
      viewAll: 'عرض الكل',
      score: 'الدرجة',
      noScore: 'بلا درجة',
      neverScanned: 'لم يُفحص بعد',
      loading: 'نجهّز البيانات…',
      failed: 'تعذّر تحميل البيانات. أعد المحاولة بعد قليل.',
      retry: 'أعد المحاولة',
      monitored: 'تحت المراقبة',
      notMonitored: 'بلا مراقبة',
      paused: 'المراقبة متوقفة',
      failing: 'يتعذّر فحصه',
      of: (used, limit) => `${used} من ${limit}`,
      sitesCount: (n) => arabicCount(n, SITES),
      scansCount: (n) => arabicCount(n, SCANS),
      alertsCount: (n) => arabicCount(n, ALERTS),
      issuesCount: (n) => arabicCount(n, ISSUES),
      delta: (change) => signed(change),
      severities: {
        critical: 'حرجة',
        serious: 'خطيرة',
        moderate: 'متوسطة',
        minor: 'طفيفة',
        info: 'ملاحظات',
      },
      trendLabel: (url, scores) => `درجات ${url} في آخر الفحوص، من الأقدم: ${scores}`,
      unavailable: 'خدمة الحسابات غير متاحة الآن. أعد المحاولة بعد قليل.',
    },
    overview: {
      hello: (name) => `أهلاً ${name}`,
      helloPlain: 'أهلاً بك',
      summary: (sites, monitored) =>
        `في حسابك ${arabicCount(sites, SITES)}، منها ${arabicCount(monitored, SITES)} تحت المراقبة.`,
      summaryEmpty: 'لم تضف موقعاً بعد. أضف أول موقع لنحفظ درجاته ونتابعها معك.',
      quick: {
        label: 'عنوان صفحة تريد فحصها',
        placeholder: 'https://example.com',
        button: 'افحص صفحة',
        working: 'نبدأ الفحص…',
      },
      kpis: {
        average: 'متوسط الدرجة',
        averageNote: (scanned) => `من ${arabicCount(scanned, SITES)} مفحوصة`,
        scanned: 'المواقع المفحوصة',
        scannedNote: (total) => `من ${arabicCount(total, SITES)} محفوظة`,
        monitored: 'تحت المراقبة',
        monitoredNote: (limit) => `الحد في خطتك ${limit}`,
        alerts: 'تنبيهات المراقبة',
        alertsNote: 'في سجل خطتك',
        alertsNone: 'لا شيء يحتاج انتباهك',
      },
      sitesTitle: 'مواقعك',
      usageTitle: 'ما استهلكته من خطتك',
      usageLead: 'الحدود من خطتك الحالية.',
      meters: {
        sites: 'المواقع المحفوظة',
        monitored: 'مواقع المراقبة',
        pdfs: 'ملفات PDF هذا الشهر',
        keys: 'مفاتيح API',
      },
      meterFull: 'وصلت إلى الحد',
      alertsTitle: 'آخر التنبيهات',
      alertsEmpty:
        'لا تنبيهات في سجل خطتك. إن نزلت درجة موقع تراقبه أو ظهرت مشكلة حرجة جديدة ستراها هنا.',
      alertsOff: 'فعّل المراقبة لموقع ليصلك تنبيه عند نزول درجته.',
      alertKinds: {
        'score-drop': (from, to) => `نزلت الدرجة من ${from} إلى ${to}`,
        critical: (count) => `ظهرت ${arabicCount(count, ISSUES)} حرجة جديدة`,
        down: 'تعذّر الوصول إلى الموقع',
      },
      recentTitle: 'آخر الفحوص',
      recentEmpty: 'لا فحوص بعد. افحص صفحة من الأعلى وسيظهر تقريرها هنا.',
      start: {
        title: 'ابدأ من هنا',
        progress: (done, total) => `${done} من ${total}`,
        steps: {
          site: 'أضف موقعك الأول',
          scan: 'شغّل أول فحص',
          monitor: 'فعّل المراقبة لموقع',
          key: 'أنشئ مفتاح API',
        },
      },
    },
    sites: {
      searchLabel: 'ابحث في مواقعك',
      searchPlaceholder: 'ابحث في مواقعك',
      filters: { all: 'الكل', monitored: 'تحت المراقبة', unmonitored: 'بلا مراقبة' },
      sortLabel: 'الترتيب',
      sorts: { recent: 'الأحدث فحصاً', worst: 'الأضعف درجة', name: 'الاسم' },
      columns: {
        site: 'الموقع',
        score: 'الدرجة',
        trend: 'الاتجاه',
        monitoring: 'المراقبة',
        last: 'آخر فحص',
        actions: 'إجراءات',
      },
      addTitle: 'أضف موقعاً',
      none: (query) => `لا مواقع تطابق «${query}».`,
      emptyTitle: 'ابدأ بموقعك الأول',
      emptyText: 'نحفظ درجته ونرسم اتجاهها عبر الزمن، ونراقبه عنك إن شئت. اكتب عنوانه في الأعلى.',
      limit: (limit) => `وصلت إلى حد خطتك: ${arabicCount(limit, SITES)}. احذف موقعاً لتحفظ غيره.`,
      removeConfirm: (url) => `احذف ${url} من مواقعك؟`,
      removeYes: 'احذف الموقع',
      removeNo: 'تراجع',
      actionsFor: (url) => `إجراءات ${url}`,
    },
    site: {
      back: 'كل المواقع',
      missing: 'لم نجد هذا الموقع',
      missingText: 'ربما حُذف من حسابك. ارجع إلى قائمة مواقعك.',
      last: (when) => `آخر فحص: ${when}`,
      monitoring: { on: 'مراقبة دورية', paused: 'المراقبة متوقفة', off: 'بلا مراقبة' },
      kpi: {
        score: 'الدرجة',
        issues: 'المشاكل المفتوحة',
        issuesNote: (notes) =>
          `و${arabicCount(notes, { one: 'ملاحظة واحدة', two: 'ملاحظتان', few: '{n} ملاحظات', many: '{n} ملاحظة', other: '{n} ملاحظة' })}`,
        issuesNone: 'لا مشاكل في آخر فحص',
        pages: 'الصفحات المفحوصة',
        pagesNote: (templates) =>
          `في ${arabicCount(templates, { one: 'قالب واحد', two: 'قالبين', few: '{n} قوالب', many: '{n} قالباً', other: '{n} قالب' })}`,
        pagesNone: 'لم نزحف إلى الموقع بعد',
        weakest: 'أضعف فئة',
        weakestNone: 'لا فئات مقيّمة',
        fromOutOf: 'من 100',
      },
      chart: {
        title: 'الدرجة عبر الزمن',
        lead: (days) => `من سجل خطتك: آخر ${arabicCount(days, DAYS)}.`,
        hint: 'مرّر المؤشر على المخطط، أو اضغط الأسهم وهو في تركيزك، لترى كل فحص.',
        readout: (date, score) => `${date}: ${score}`,
        noScore: 'بلا درجة',
        empty: 'لا فحوص لهذا الموقع في هذه المدة. افحصه ليبدأ المخطط.',
        unreached: 'لم نصل إلى الموقع في هذه الفحوص، فلا درجة ترسم.',
      },
      donut: {
        title: 'المشاكل حسب الخطورة',
        lead: 'من آخر تقرير مكتمل.',
        total: 'مشكلة',
        clean: 'لا مشاكل في آخر فحص.',
        loading: 'نقرأ آخر تقرير…',
        none: 'لا نقرأ تقرير هذا الموقع الآن.',
        summary: (parts) => `المشاكل حسب الخطورة: ${parts}.`,
      },
      categories: {
        title: 'الدرجة حسب الفئة',
        lead: 'من الأضعف إلى الأقوى.',
        none: 'لا فئات مقيّمة في آخر فحص.',
        fullNote: (count) =>
          `${arabicCount(count, { one: 'فئة واحدة', two: 'فئتان', few: '{n} فئات', many: '{n} فئة', other: '{n} فئة' })} درجتها 100.`,
      },
      crawl: {
        title: 'الفحص العميق',
        none: 'لم نزحف إلى هذا الموقع كله بعد. الفحص العميق يجمع صفحاته في قوالب ويريك أيها يحتاج الإصلاح أولاً.',
        templates: 'القوالب',
        pages: (found, checked) => `${checked} من ${found} صفحة`,
        open: 'افتح تقرير الزحف',
      },
      monitor: { title: 'المراقبة' },
      history: { title: 'فحوص هذا الموقع', none: 'لا فحوص لهذا الموقع بعد.' },
      compareLast: 'قارن آخر فحصين',
      compareNone: 'تحتاج فحصين مكتملين للمقارنة',
      share: 'افتح آخر تقرير',
      pdf: 'تقرير PDF',
    },
    scans: {
      filters: {
        search: 'ابحث بالعنوان',
        searchPlaceholder: 'ابحث بعنوان الصفحة',
        state: 'الحالة',
        stateAll: 'كل الحالات',
        site: 'الموقع',
        siteAll: 'كل المواقع',
        clear: 'امسح التصفية',
      },
      columns: {
        url: 'العنوان',
        state: 'الحالة',
        score: 'الدرجة',
        when: 'الوقت',
        actions: 'إجراءات',
      },
      showing: (from, to, total) => `${from} إلى ${to} من ${total}`,
      page: (page, pages) => `صفحة ${page} من ${pages}`,
      previous: 'السابق',
      next: 'التالي',
      none: 'لا فحوص تطابق هذه التصفية.',
      emptyTitle: 'لا فحوص بعد',
      emptyText: 'كل فحص تجريه وأنت مسجّل الدخول يُحفظ هنا مع تقريره، فتقارن وتتابع التحسّن.',
      keptFor: (days) => `نحفظ فحوصك ${arabicCount(days, DAYS)}، ثم نحذفها.`,
    },
    monitoring: {
      columns: {
        site: 'الموقع',
        every: 'الدورة',
        next: 'الفحص التالي',
        trend: 'آخر الدرجات',
        status: 'الحال',
      },
      status: { ok: 'يعمل', paused: 'متوقفة', failing: 'يتعذّر فحصه' },
      everyDays: (n) => arabicCount(n, EVERY_DAYS),
      emptyTitle: 'لا موقع تحت المراقبة',
      emptyText: 'فعّل المراقبة لموقع محفوظ، فنفحصه عنك بانتظام وننبّهك إن نزلت درجته.',
      limit: (used, limit) => `${used} من ${limit} مواقع المراقبة`,
      turnOff: 'أوقف المراقبة',
      feedTitle: 'آخر التنبيهات',
      feedLead: 'نحسبها من فحوص مواقعك بإعدادات تنبيهك الحالية.',
      feedEmpty: 'لا تنبيهات في سجل خطتك.',
      goSites: 'اذهب إلى مواقعي',
    },
    crawls: {
      emptyTitle: 'لا موقع محفوظ للزحف',
      emptyText: 'احفظ موقعاً أولاً، ثم ابدأ فحصه العميق من هنا.',
      cap: (pages) => `تقرأ خطتك حتى ${arabicCount(pages, PAGES)} في الزحفة.`,
      latest: 'آخر زحف',
    },
    account: {
      profile: 'بياناتك',
      planTitle: 'خطتك',
      planLead: 'هذه حدود خطتك الحالية، من حسابك مباشرة.',
      planRows: {
        savedSites: 'المواقع المحفوظة',
        monitoredSites: 'مواقع المراقبة',
        monitorEvery: 'دورة المراقبة',
        crawlPages: 'صفحات الزحفة',
        pdfPerMonth: 'ملفات PDF في الشهر',
        apiKeys: 'مفاتيح API',
        history: 'مدة حفظ الفحوص',
      },
      planValues: {
        count: (n) => String(n),
        every: (days) => arabicCount(days, EVERY_DAYS),
        days: (n) => arabicCount(n, DAYS),
        pages: (n) => arabicCount(n, PAGES),
        none: 'غير متاح في خطتك',
      },
      planNote: 'الخطط المدفوعة قادمة قريباً، وسنعلمك قبل أن تتغير أي حدود.',
      usageTitle: 'ما استهلكته',
      sessions: 'الجلسات',
      dangerTitle: 'منطقة الحذف',
    },
    empty: { addSite: 'أضف موقعاً' },
  },
  en: {
    shell: {
      skip: 'Skip to content',
      noscript: 'Your dashboard needs JavaScript: turn it on in your browser, then reload.',
      appName: 'Arablyzer, your dashboard',
      sidebar: 'Sidebar',
      bottomBar: 'Navigation',
      more: 'More',
      collapse: 'Collapse the menu',
      expand: 'Expand the menu',
      closeMenu: 'Close the menu',
      loading: 'Opening your dashboard…',
      toLogin: 'Taking you to sign in…',
      off: 'Accounts are not turned on at this site. Scanning works as usual without one.',
      failed: 'We could not open your dashboard just now.',
      retry: 'Try again',
      crumbs: 'Breadcrumb',
      theme: { toDark: 'Dark mode', toLight: 'Light mode' },
      user: {
        menu: 'Account menu',
        language: 'Language',
        signOut: 'Sign out',
        signOutEverywhere: 'Sign out everywhere',
      },
      switcher: { label: 'Site', all: 'All sites', none: 'No sites yet', add: 'Add a site' },
      search: {
        open: 'Search your sites and scans',
        placeholder: 'Go to a site, a scan or a page…',
        title: 'Go to',
        pages: 'Pages',
        sites: 'Sites',
        scans: 'Scans',
        none: (query) => `No results for “${query}”.`,
        hint: 'Search by a site’s address or a page’s name',
        close: 'Close the search',
      },
      plan: {
        title: 'Saved sites',
        text: (used, limit) => `${used} of ${limit} on your plan`,
        compare: 'Compare plans',
      },
    },
    nav: {
      groups: {
        main: 'Dashboard',
        follow: 'Follow',
        build: 'For developers and teams',
        account: 'Account',
      },
      items: {
        overview: 'Overview',
        sites: 'My sites',
        scans: 'Scans',
        monitoring: 'Monitoring',
        crawls: 'Deep crawl',
        pdfs: 'PDF reports',
        keys: 'API keys',
        brand: 'Your brand',
        account: 'Account and plan',
      },
    },
    pages: {
      overview: { title: 'Overview', lead: 'How your sites are today, and what needs a look.' },
      sites: {
        title: 'My sites',
        lead: 'The sites you follow: each one’s score and its direction, and a scan in a click.',
      },
      site: { title: 'Site', lead: 'A site’s scores, issues and scans on one page.' },
      scans: { title: 'Scans', lead: 'Every scan you made while signed in, with its report.' },
      monitoring: {
        title: 'Monitoring',
        lead: 'Sites we scan for you on a schedule, and where alerts reach you.',
      },
      crawls: {
        title: 'Deep crawl',
        lead: 'We crawl your whole site and group its pages into templates, so you fix a template once.',
      },
      pdfs: { title: 'PDF reports', lead: 'Reports to download and send to a client.' },
      keys: { title: 'API keys', lead: 'Connect Arablyzer to your tools and your AI assistant.' },
      brand: { title: 'Your brand', lead: 'Your company’s name, logo and colour on your reports.' },
      account: {
        title: 'Account and plan',
        lead: 'Your details, what your plan allows, and what you have used.',
      },
    },
    common: {
      scanNow: 'Scan now',
      scanning: 'Starting the scan…',
      open: 'Open',
      openReport: 'Open the report',
      viewAll: 'View all',
      score: 'Score',
      noScore: 'No score',
      neverScanned: 'Not scanned yet',
      loading: 'Getting the data…',
      failed: 'We could not load the data. Try again in a moment.',
      retry: 'Try again',
      monitored: 'Monitored',
      notMonitored: 'Not monitored',
      paused: 'Monitoring paused',
      failing: 'Cannot be reached',
      of: (used, limit) => `${used} of ${limit}`,
      sitesCount: (n) => englishCount(n, 'site', 'sites'),
      scansCount: (n) => englishCount(n, 'scan', 'scans'),
      alertsCount: (n) => englishCount(n, 'alert', 'alerts'),
      issuesCount: (n) => englishCount(n, 'issue', 'issues'),
      delta: (change) => signed(change),
      severities: {
        critical: 'Critical',
        serious: 'Serious',
        moderate: 'Moderate',
        minor: 'Minor',
        info: 'Notes',
      },
      trendLabel: (url, scores) => `Scores of ${url} over its last scans, oldest first: ${scores}`,
      unavailable: 'The accounts service is not available right now. Try again in a moment.',
    },
    overview: {
      hello: (name) => `Welcome, ${name}`,
      helloPlain: 'Welcome',
      summary: (sites, monitored) =>
        `Your account has ${englishCount(sites, 'site', 'sites')}, ${monitored} of them monitored.`,
      summaryEmpty:
        'You have not added a site yet. Add your first, and we will keep its scores and follow them with you.',
      quick: {
        label: 'The address of a page to scan',
        placeholder: 'https://example.com',
        button: 'Scan a page',
        working: 'Starting the scan…',
      },
      kpis: {
        average: 'Average score',
        averageNote: (scanned) =>
          `across ${englishCount(scanned, 'scanned site', 'scanned sites')}`,
        scanned: 'Sites scanned',
        scannedNote: (total) => `of ${englishCount(total, 'saved site', 'saved sites')}`,
        monitored: 'Monitored',
        monitoredNote: (limit) => `Your plan’s limit is ${limit}`,
        alerts: 'Monitoring alerts',
        alertsNote: 'in your plan’s history',
        alertsNone: 'Nothing needs a look',
      },
      sitesTitle: 'Your sites',
      usageTitle: 'What you have used of your plan',
      usageLead: 'The limits are your current plan’s.',
      meters: {
        sites: 'Saved sites',
        monitored: 'Monitored sites',
        pdfs: 'PDF files this month',
        keys: 'API keys',
      },
      meterFull: 'At the limit',
      alertsTitle: 'Latest alerts',
      alertsEmpty:
        'No alerts in your plan’s history. If a monitored site’s score drops or a new critical issue appears, you will see it here.',
      alertsOff: 'Turn monitoring on for a site to be alerted when its score drops.',
      alertKinds: {
        'score-drop': (from, to) => `Score dropped from ${from} to ${to}`,
        critical: (count) => englishCount(count, 'new critical issue', 'new critical issues'),
        down: 'The site could not be reached',
      },
      recentTitle: 'Latest scans',
      recentEmpty: 'No scans yet. Scan a page above and its report will show here.',
      start: {
        title: 'Start here',
        progress: (done, total) => `${done} of ${total}`,
        steps: {
          site: 'Add your first site',
          scan: 'Run your first scan',
          monitor: 'Turn monitoring on for a site',
          key: 'Create an API key',
        },
      },
    },
    sites: {
      searchLabel: 'Search your sites',
      searchPlaceholder: 'Search your sites',
      filters: { all: 'All', monitored: 'Monitored', unmonitored: 'Not monitored' },
      sortLabel: 'Sort',
      sorts: { recent: 'Latest scan', worst: 'Lowest score', name: 'Name' },
      columns: {
        site: 'Site',
        score: 'Score',
        trend: 'Trend',
        monitoring: 'Monitoring',
        last: 'Last scan',
        actions: 'Actions',
      },
      addTitle: 'Add a site',
      none: (query) => `No sites match “${query}”.`,
      emptyTitle: 'Start with your first site',
      emptyText:
        'We keep its score and draw its direction over time, and watch it for you if you like. Type its address above.',
      limit: (limit) =>
        `You are at your plan’s limit of ${englishCount(limit, 'site', 'sites')}. Remove one to save another.`,
      removeConfirm: (url) => `Remove ${url} from your sites?`,
      removeYes: 'Remove the site',
      removeNo: 'Keep it',
      actionsFor: (url) => `Actions for ${url}`,
    },
    site: {
      back: 'All sites',
      missing: 'We could not find this site',
      missingText: 'It may have been removed from your account. Go back to your sites.',
      last: (when) => `Last scan: ${when}`,
      monitoring: {
        on: 'Scanned on a schedule',
        paused: 'Monitoring paused',
        off: 'Not monitored',
      },
      kpi: {
        score: 'Score',
        issues: 'Open issues',
        issuesNote: (notes) => `and ${englishCount(notes, 'note', 'notes')}`,
        issuesNone: 'No issues in the last scan',
        pages: 'Pages checked',
        pagesNote: (templates) => `in ${englishCount(templates, 'template', 'templates')}`,
        pagesNone: 'Not crawled yet',
        weakest: 'Weakest category',
        weakestNone: 'No category scored',
        fromOutOf: 'out of 100',
      },
      chart: {
        title: 'Score over time',
        lead: (days) => `From your plan’s history: the last ${englishCount(days, 'day', 'days')}.`,
        hint: 'Move the pointer over the chart, or press the arrow keys while it is focused, to see each scan.',
        readout: (date, score) => `${date}: ${score}`,
        noScore: 'No score',
        empty: 'No scans of this site in this period. Scan it to start the chart.',
        unreached: 'We could not reach the site in these scans, so there is no score to draw.',
      },
      donut: {
        title: 'Issues by severity',
        lead: 'From the last finished report.',
        total: 'issues',
        clean: 'No issues in the last scan.',
        loading: 'Reading the last report…',
        none: 'We cannot read this site’s report right now.',
        summary: (parts) => `Issues by severity: ${parts}.`,
      },
      categories: {
        title: 'Score by category',
        lead: 'From the weakest to the strongest.',
        none: 'No category was scored in the last scan.',
        fullNote: (count) => `${englishCount(count, 'category', 'categories')} scored 100.`,
      },
      crawl: {
        title: 'Deep crawl',
        none: 'We have not crawled this whole site yet. A deep crawl groups its pages into templates and shows which needs fixing first.',
        templates: 'Templates',
        pages: (found, checked) => `${checked} of ${found} pages`,
        open: 'Open the crawl report',
      },
      monitor: { title: 'Monitoring' },
      history: { title: 'This site’s scans', none: 'No scans of this site yet.' },
      compareLast: 'Compare the last two',
      compareNone: 'You need two finished scans to compare',
      share: 'Open the last report',
      pdf: 'PDF report',
    },
    scans: {
      filters: {
        search: 'Search by address',
        searchPlaceholder: 'Search by a page’s address',
        state: 'State',
        stateAll: 'All states',
        site: 'Site',
        siteAll: 'All sites',
        clear: 'Clear the filter',
      },
      columns: { url: 'Address', state: 'State', score: 'Score', when: 'When', actions: 'Actions' },
      showing: (from, to, total) => `${from} to ${to} of ${total}`,
      page: (page, pages) => `Page ${page} of ${pages}`,
      previous: 'Previous',
      next: 'Next',
      none: 'No scans match this filter.',
      emptyTitle: 'No scans yet',
      emptyText:
        'Every scan you run while signed in is kept here with its report, so you can compare and follow your progress.',
      keptFor: (days) =>
        `We keep your scans for ${englishCount(days, 'day', 'days')}, then delete them.`,
    },
    monitoring: {
      columns: {
        site: 'Site',
        every: 'Schedule',
        next: 'Next scan',
        trend: 'Latest scores',
        status: 'Status',
      },
      status: { ok: 'Running', paused: 'Paused', failing: 'Cannot be reached' },
      everyDays: (n) => (n === 1 ? 'Every day' : `Every ${n} days`),
      emptyTitle: 'No site is monitored',
      emptyText:
        'Turn monitoring on for a saved site: we scan it for you on a schedule and alert you when its score drops.',
      limit: (used, limit) => `${used} of ${limit} monitoring slots`,
      turnOff: 'Turn monitoring off',
      feedTitle: 'Latest alerts',
      feedLead: 'Worked out from your sites’ scans with your current alert settings.',
      feedEmpty: 'No alerts in your plan’s history.',
      goSites: 'Go to my sites',
    },
    crawls: {
      emptyTitle: 'No saved site to crawl',
      emptyText: 'Save a site first, then start its deep crawl from here.',
      cap: (pages) => `Your plan reads up to ${englishCount(pages, 'page', 'pages')} a crawl.`,
      latest: 'Latest crawl',
    },
    account: {
      profile: 'Your details',
      planTitle: 'Your plan',
      planLead: 'These are your current plan’s limits, straight from your account.',
      planRows: {
        savedSites: 'Saved sites',
        monitoredSites: 'Monitored sites',
        monitorEvery: 'Monitoring schedule',
        crawlPages: 'Pages per crawl',
        pdfPerMonth: 'PDF files a month',
        apiKeys: 'API keys',
        history: 'How long scans are kept',
      },
      planValues: {
        count: (n) => String(n),
        every: (days) => (days === 1 ? 'Every day' : `Every ${days} days`),
        days: (n) => englishCount(n, 'day', 'days'),
        pages: (n) => englishCount(n, 'page', 'pages'),
        none: 'Not on your plan',
      },
      planNote: 'Paid plans are coming soon, and we will tell you before any limit changes.',
      usageTitle: 'What you have used',
      sessions: 'Sessions',
      dangerTitle: 'Delete',
    },
    empty: { addSite: 'Add a site' },
  },
}
