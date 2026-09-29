import type { Copy } from './copy'
import { arabicCount, englishCount } from './plural'

/** The toolbox's categories (BUILD-PLAN §5.1), in the table's order: packages/tools has them too. */
export type ToolCategoryName =
  | 'crawl'
  | 'index'
  | 'onpage'
  | 'links'
  | 'schema'
  | 'intl'
  | 'seo-tools'
  | 'search-data'
  | 'speed'
  | 'commerce'
  | 'ai'
  | 'trust'
  | 'ar-render'
  | 'rtl'
  | 'ar-content'
  | 'forms'
  | 'locale'
  | 'general'

/** What a tool reads, shown on its card: the page as sent, robots.txt, browsers, or Chrome's data. */
export type ToolTag = 'html' | 'robots' | 'render' | 'crux' | 'generator'

/** The tools' directory and the tool pages (M2.2), around each tool's own copy. */
export interface ToolsStrings {
  readonly directory: {
    readonly meta: { readonly title: string; readonly description: string }
    readonly title: string
    readonly intro: string
    readonly search: string
    readonly searchPlaceholder: string
    readonly categories: string
    readonly all: string
    /** The categories that are Arablyzer's own (§5.1: «فريد»). */
    readonly arabicLayer: string
    readonly count: (count: number) => string
    /** When the search matches no tool. */
    readonly none: string
  }
  readonly categories: Readonly<
    Record<ToolCategoryName, { readonly name: string; readonly blurb: string }>
  >
  readonly tags: Readonly<Record<ToolTag, string>>
  /** The home page's section on the tools (§ 04 in the design). */
  readonly home: {
    readonly kicker: string
    readonly title: string
    readonly all: string
    readonly open: string
    /** What a tool reads, on its card there. */
    readonly reads: Readonly<Record<ToolTag, string>>
  }
  readonly page: {
    readonly breadcrumb: string
    readonly urlLabel: string
    readonly submit: string
    readonly submitting: string
    /** Under the form: free, and what the tool reads. */
    readonly note: Readonly<Record<'html' | 'render', string>>
    readonly runs: string
    readonly near: string
    readonly updated: string
    readonly methodology: string
    readonly fullScan: string
  }
  readonly result: {
    readonly title: string
    readonly running: string
    readonly problems: (count: number) => string
    readonly passed: string
    readonly notApplicable: string
    readonly review: string
    readonly ruleLabel: string
    readonly share: string
    readonly howToFix: string
    readonly blocked: string
    readonly failed: string
    readonly offline: string
  }
}

export const TOOLS_UI: Copy<ToolsStrings> = {
  reviewed: false,
  ar: {
    directory: {
      meta: {
        title: 'أدوات فحص المواقع العربية مجاناً — Arablyzer',
        description:
          'أدوات مجانية بلا تسجيل تفحص صفحتك: اتجاه RTL، والخطوط العربية، وروابط واتساب، وrobots.txt، والأرشفة. كل أداة تقول لك لماذا يهم وكيف تُصلح.',
      },
      title: 'الأدوات',
      intro: 'أدوات مجانية بلا تسجيل. كل أداة تفحص شيئاً واحداً، وتقول لك لماذا يهم وكيف تُصلحه.',
      search: 'ابحث في الأدوات',
      searchPlaceholder: 'ابحث: خط، واتساب، robots، hreflang…',
      categories: 'الفئات',
      all: 'الكل',
      arabicLayer: 'الطبقة العربية',
      count: (count) =>
        arabicCount(count, {
          one: 'أداة واحدة',
          two: 'أداتان',
          few: '{n} أدوات',
          many: '{n} أداة',
        }),
      none: 'لا أداة بهذا الاسم بعد.',
    },
    categories: {
      crawl: {
        name: 'الزحف والوصول',
        blurb: 'هل تصل محركات البحث إلى صفحتك، وماذا يقول لها ملف robots.txt؟',
      },
      index: {
        name: 'الأرشفة',
        blurb: 'هل يستطيع Google أن يؤرشف صفحتك، وأي نسخة منها يعتمد؟',
      },
      onpage: {
        name: 'داخل الصفحة',
        blurb: 'العنوان والوصف والعناوين ومعاينة الروابط: ما يراه الباحث قبل أن يفتح صفحتك.',
      },
      links: { name: 'الروابط', blurb: 'روابط تعمل، وتقود إلى حيث تقول.' },
      schema: {
        name: 'البيانات المنظّمة',
        blurb: 'بيانات منظّمة صالحة يقرؤها Google كما كتبتها.',
      },
      intl: {
        name: 'اللغات والدول',
        blurb: 'نسختك العربية والإنجليزية، ولغة كل صفحة كما تعلنها.',
      },
      'seo-tools': {
        name: 'أدوات SEO',
        blurb: 'أدوات للتخطيط: التحويلات، والانتقال إلى نطاق جديد، وملفات robots.',
      },
      'search-data': {
        name: 'بيانات البحث',
        blurb: 'ما تقوله بيانات Search Console عن صفحاتك.',
      },
      speed: {
        name: 'السرعة',
        blurb: 'سرعة صفحتك عند زوارها الحقيقيين، ووزن ما تحمّله.',
      },
      commerce: {
        name: 'التجارة الإلكترونية',
        blurb: 'صفحات المنتجات، والأسعار بعملات الخليج، وطرق الدفع.',
      },
      ai: {
        name: 'بحث الذكاء الاصطناعي',
        blurb: 'هل تصل زواحف البحث بالذكاء الاصطناعي إلى صفحتك؟',
      },
      trust: {
        name: 'الثقة والأمان',
        blurb: 'HTTPS والشهادة وترويسات الأمان، وصفحة يستعملها الجميع.',
      },
      'ar-render': {
        name: 'العرض العربي',
        blurb: 'هل تُرسم حروفك متصلة وبالخط الذي اخترته؟ نعرض الصفحة في ثلاثة متصفحات ونقارن.',
      },
      rtl: {
        name: 'الاتجاه RTL',
        blurb: 'صفحة تُقرأ من اليمين، وأرقام وكلمات إنجليزية في مكانها الصحيح.',
      },
      'ar-content': {
        name: 'المحتوى العربي',
        blurb: 'علامات الترقيم والأرقام والنص العربي كما يُكتب.',
      },
      forms: {
        name: 'النماذج والتواصل',
        blurb:
          'نماذج تقبل الأسماء والأرقام العربية، وروابط واتساب تفتح فعلاً. نختبر بلا إرسال أبداً.',
      },
      locale: {
        name: 'التوطين الخليجي',
        blurb: 'العملات والتواريخ والأرقام والعناوين كما تُكتب في الخليج.',
      },
      general: {
        name: 'أدوات عامة',
        blurb: 'أدوات مساعدة: رسائل الأخطاء مشروحة، وروابط عربية نظيفة.',
      },
    },
    tags: {
      html: 'HTML',
      robots: 'robots.txt',
      render: '3 متصفحات',
      crux: 'بيانات Chrome',
      generator: 'مولّد',
    },
    home: {
      kicker: 'الأدوات',
      title: 'أدوات مجانية، كل أداة صفحة',
      all: 'كل الأدوات',
      open: 'افتح الأداة',
      reads: {
        html: 'يقرأ HTML',
        robots: 'يقرأ robots.txt',
        render: 'في 3 متصفحات',
        crux: 'من بيانات Chrome',
        generator: 'مولّد',
      },
    },
    page: {
      breadcrumb: 'مسار الصفحة',
      urlLabel: 'رابط الصفحة',
      submit: 'افحص الصفحة',
      submitting: 'نفحص…',
      note: {
        html: 'مجاني وبلا تسجيل. نقرأ الصفحة كما يرسلها الخادم.',
        render: 'مجاني وبلا تسجيل. نعرض الصفحة في المتصفحات كما يعرضها زائرك.',
      },
      runs: 'ما تشغّله هذه الأداة',
      near: 'أدوات قريبة',
      updated: 'آخر تحديث',
      methodology: 'المنهجية وحساب الدرجة',
      fullScan: 'الفحص الكامل لصفحتك',
    },
    result: {
      title: 'النتيجة',
      running: 'نفحص الصفحة…',
      problems: (count) =>
        arabicCount(count, {
          one: 'مشكلة واحدة تحتاج إصلاحاً',
          two: 'مشكلتان تحتاجان إصلاحاً',
          few: '{n} مشكلات تحتاج إصلاحاً',
          many: '{n} مشكلة تحتاج إصلاحاً',
        }),
      passed: 'الصفحة تجتاز هذا الفحص',
      notApplicable: 'لا ينطبق هذا الفحص على الصفحة',
      review: 'فيها ما يحتاج أن تراجعه بنفسك',
      ruleLabel: 'القاعدة:',
      share: 'رابط هذه النتيجة',
      howToFix: 'كيف تُصلح',
      blocked: 'لم نتمكن من فحص الصفحة: ردّ الخادم بخطأ أو منع الفحص.',
      failed: 'تعذّر إكمال الفحص. جرّب بعد قليل.',
      offline: 'تعذّر الوصول إلى خدمة الفحص. تواصل الصفحة المحاولة.',
    },
  },
  en: {
    directory: {
      meta: {
        title: 'Free website checkers for Arabic sites — Arablyzer',
        description:
          'Free tools, no sign-up, that check your page: RTL direction, Arabic fonts, WhatsApp links, robots.txt and indexing. Each tells you why it matters and how to fix it.',
      },
      title: 'Tools',
      intro:
        'Free tools, no sign-up. Each tool checks one thing, and tells you why it matters and how to fix it.',
      search: 'Search the tools',
      searchPlaceholder: 'Search: font, WhatsApp, robots, hreflang…',
      categories: 'Categories',
      all: 'All',
      arabicLayer: 'The Arabic layer',
      count: (count) => englishCount(count, 'tool', 'tools'),
      none: 'No tool by that name yet.',
    },
    categories: {
      crawl: {
        name: 'Crawling and access',
        blurb: 'Can search engines reach your page, and what does your robots.txt tell them?',
      },
      index: {
        name: 'Indexing',
        blurb: 'Can Google index your page, and which version of it does it keep?',
      },
      onpage: {
        name: 'On the page',
        blurb:
          'Title, description, headings and link previews: what a searcher sees before opening your page.',
      },
      links: { name: 'Links', blurb: 'Links that work, and lead where they say.' },
      schema: {
        name: 'Structured data',
        blurb: 'Valid structured data that Google reads as you wrote it.',
      },
      intl: {
        name: 'Languages and countries',
        blurb: 'Your Arabic and English versions, and each page’s language as it declares it.',
      },
      'seo-tools': {
        name: 'SEO tools',
        blurb: 'Tools for planning: redirects, moving to a new domain, and robots files.',
      },
      'search-data': {
        name: 'Search data',
        blurb: 'What your Search Console data says about your pages.',
      },
      speed: {
        name: 'Speed',
        blurb: 'How fast your page is for its real visitors, and the weight of what it loads.',
      },
      commerce: {
        name: 'E-commerce',
        blurb: 'Product pages, prices in Gulf currencies, and payment methods.',
      },
      ai: { name: 'AI search', blurb: 'Can AI search crawlers reach your page?' },
      trust: {
        name: 'Trust and security',
        blurb: 'HTTPS, the certificate and security headers, and a page everyone can use.',
      },
      'ar-render': {
        name: 'Arabic rendering',
        blurb:
          'Are your letters drawn joined, and in the font you chose? We render the page in three browsers and compare.',
      },
      rtl: {
        name: 'RTL direction',
        blurb: 'A page that reads from the right, with numbers and English words in their place.',
      },
      'ar-content': {
        name: 'Arabic content',
        blurb: 'Punctuation, digits and Arabic text as it is written.',
      },
      forms: {
        name: 'Forms and contact',
        blurb:
          'Forms that accept Arabic names and digits, and WhatsApp links that open. We test without ever submitting.',
      },
      locale: {
        name: 'Gulf localization',
        blurb: 'Currencies, dates, numbers and addresses as the Gulf writes them.',
      },
      general: {
        name: 'General tools',
        blurb: 'Helpers: error messages explained, and clean Arabic URLs.',
      },
    },
    tags: {
      html: 'HTML',
      robots: 'robots.txt',
      render: '3 browsers',
      crux: 'Chrome data',
      generator: 'Generator',
    },
    home: {
      kicker: 'Tools',
      title: 'Free tools, each on its own page',
      all: 'All tools',
      open: 'Open the tool',
      reads: {
        html: 'Reads the HTML',
        robots: 'Reads robots.txt',
        render: 'In 3 browsers',
        crux: 'From Chrome data',
        generator: 'Generator',
      },
    },
    page: {
      breadcrumb: 'Breadcrumb',
      urlLabel: 'Page URL',
      submit: 'Check the page',
      submitting: 'Checking…',
      note: {
        html: 'Free, no sign-up. We read the page as the server sends it.',
        render: 'Free, no sign-up. We render the page in browsers, as your visitor sees it.',
      },
      runs: 'What this tool runs',
      near: 'Nearby tools',
      updated: 'Last updated',
      methodology: 'Methodology and scoring',
      fullScan: 'A full check of your page',
    },
    result: {
      title: 'Result',
      running: 'Checking the page…',
      problems: (count) => (count === 1 ? '1 problem to fix' : `${String(count)} problems to fix`),
      passed: 'The page passes this check',
      notApplicable: 'This check does not apply to the page',
      review: 'Something here needs your own review',
      ruleLabel: 'Rule:',
      share: 'Link to this result',
      howToFix: 'How to fix',
      blocked:
        'We could not check the page: the server answered with an error, or refused the check.',
      failed: 'The check could not finish. Try again shortly.',
      offline: 'We cannot reach the checking service. The page keeps trying.',
    },
  },
}
