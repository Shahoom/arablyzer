import type { Copy } from './copy'
import {
  arabicCount,
  englishCount,
  englishForm,
  RULES_NOMINATIVE,
  type ArabicForms,
} from './plural'

/**
 * The tools the hero's chips link to, by slug: the Arabic layer's own checks (what no foreign tool
 * measures) and the WhatsApp link generator. Each is a tool page; the chip's words are the copy's.
 */
export const HERO_TOOLS = [
  'rtl-check',
  'arabic-shaping-check',
  'arabic-font-check',
  'arabic-form-test',
  'whatsapp-link-generator',
] as const
export type HeroTool = (typeof HERO_TOOLS)[number]

export interface HomeStrings {
  readonly meta: { readonly title: string; readonly description: string }
  readonly hero: {
    /** The pill over the heading: how many tools there are, and that they cost nothing. */
    readonly pill: { readonly count: (tools: number) => string; readonly text: string }
    /** The heading, then its marked ending. */
    readonly title: string
    readonly titleMark: string
    readonly lead: string
    /** In the scan box beside the browsers: a scan runs every rule. */
    readonly scope: { readonly label: string; readonly rules: (rules: number) => string }
    /** The list of browsers the page is opened in, for a screen reader. */
    readonly engines: string
    /** The chips under the scan box: tools, each a link. */
    readonly tools: {
      readonly label: string
      readonly names: Readonly<Record<HeroTool, string>>
      readonly all: string
    }
    /** The trust line: three things that are true today. */
    readonly promises: readonly [string, string, string]
  }
  /**
   * The product shot under the hero: golden report 04 as a visitor's report shows it. Every
   * number on it comes from that report; the words around the numbers are these.
   */
  readonly figure: {
    readonly label: string
    readonly source: string
    readonly outOf: string
    readonly tally: (failed: number, passed: number) => string
    /** The list of category scores, for a screen reader. */
    readonly categories: string
    readonly found: string
    readonly element: string
    /** Where a finding was seen: `names` are the engines, already joined. */
    readonly inEngines: (names: string) => string
    readonly onlyIn: (name: string) => string
    readonly declarations: (count: number) => string
    /** The label on the overflow drawing. */
    readonly offscreen: (pixels: number) => string
    /** The glass cards floating beside the shot. */
    readonly float: {
      readonly parted: string
      readonly screen: (pixels: number) => string
      readonly overflow: (pixels: number) => string
      readonly passed: (rules: number) => string
      readonly skipped: (rules: number) => string
    }
  }
  /** The tools marquee: its caption, over the names. */
  readonly marquee: { readonly label: (tools: number) => string }
  /** What the numbers count, each as a noun for its number (the number itself is large above it). */
  readonly counts: {
    readonly label: string
    readonly tools: (count: number) => string
    readonly rules: (count: number) => string
    readonly browsers: (count: number) => string
    readonly guides: (count: number) => string
    readonly terms: (count: number) => string
  }
  /** The bento: what other tools do not see. Tiles that are not data say so (`example`). */
  readonly bento: {
    readonly kicker: string
    readonly title: string
    readonly lead: string
    readonly example: string
    readonly engines: {
      readonly title: string
      readonly text: string
      readonly joined: string
      readonly apart: string
    }
    readonly forms: {
      readonly title: string
      readonly text: string
      readonly phone: string
      readonly nameAccepted: string
      readonly digitsRejected: string
    }
    readonly whatsapp: { readonly title: string }
    readonly ai: { readonly title: string; readonly allowed: string; readonly blocked: string }
    readonly speed: {
      readonly title: string
      readonly text: string
      readonly seconds: string
      readonly milliseconds: string
    }
    readonly trust: { readonly title: string; readonly ok: string; readonly missing: string }
    readonly robots: { readonly title: string; readonly blocks: string }
  }
  readonly how: {
    readonly kicker: string
    readonly title: string
    readonly steps: readonly [Titled, Titled, Titled]
  }
  /** The dark band on monitoring, which is not built yet (the dashboard is Phase 4). */
  readonly monitoring: {
    readonly kicker: string
    readonly soon: string
    readonly title: string
    readonly text: string
    readonly points: readonly [string, string, string, string]
    readonly scan: string
    readonly plans: string
    readonly preview: {
      readonly label: string
      readonly example: string
      readonly live: string
      readonly score: string
      readonly problems: string
      readonly pages: string
      readonly alert: string
    }
  }
  /** Plans: free now, with what is true today; paid plans are announced, with no prices. */
  readonly plans: {
    readonly kicker: string
    readonly title: string
    readonly lead: string
    readonly soon: string
    readonly note: string
    readonly includesFree: string
    readonly free: {
      readonly name: string
      readonly tag: string
      readonly text: string
      readonly allTools: (tools: number) => string
      readonly points: readonly [string, string]
      readonly cta: string
    }
    readonly monitoring: {
      readonly name: string
      readonly text: string
      readonly points: readonly [string, string]
    }
    readonly crawl: {
      readonly name: string
      readonly text: string
      readonly points: readonly [string]
    }
  }
  readonly faq: {
    readonly kicker: string
    readonly title: string
    readonly items: readonly { readonly question: string; readonly answer: string }[]
  }
  readonly cta: { readonly title: string; readonly text: string; readonly button: string }
}

interface Titled {
  readonly title: string
  readonly text: string
}

/** Tools, as a count on its own: «أداة واحدة»، «3 أدوات»، «12 أداة». */
const TOOLS: ArabicForms = {
  one: 'أداة واحدة',
  two: 'أداتان',
  few: '{n} أدوات',
  many: '{n} أداة',
}

/** A noun that follows the number written large above it: the number is not repeated. */
const noun =
  (forms: ArabicForms) =>
  (count: number): string =>
    arabicCount(count, forms)

export const HOME: Copy<HomeStrings> = {
  reviewed: false,
  ar: {
    meta: {
      title: 'Arablyzer: افحص موقعك كما يراه Google والزبون العربي',
      description:
        'أدوات مجانية بلا تسجيل تفتح صفحتك في ثلاثة متصفحات وتقيس اتصال الحروف العربية، واتجاه الصفحة، والخطوط، والنماذج، وأسعار الخليج، وأرشفة Google.',
    },
    hero: {
      pill: { count: (tools) => arabicCount(tools, TOOLS), text: 'كلها مجانية، وبلا تسجيل' },
      title: 'افحص موقعك كما يراه Google',
      titleMark: 'والزبون العربي على جواله',
      lead: 'نفتح صفحتك في ثلاثة متصفحات ونقيس ما لا تقيسه الأدوات الأجنبية: الحروف والاتجاه والخطوط والنماذج.',
      scope: { label: 'كل الفحوص', rules: (rules) => arabicCount(rules, RULES_NOMINATIVE) },
      engines: 'تُفتح الصفحة في هذه المتصفحات',
      tools: {
        label: 'أدوات سريعة',
        names: {
          'rtl-check': 'اتجاه الصفحة RTL',
          'arabic-shaping-check': 'اتصال الحروف',
          'arabic-font-check': 'الخط العربي',
          'arabic-form-test': 'نماذج تقبل «محمد»',
          'whatsapp-link-generator': 'مولّد رابط واتساب',
        },
        all: 'كل الأدوات',
      },
      promises: [
        'مجاني وبلا تسجيل',
        'لا نرسل أي نموذج',
        'الصفحة نفسها تعطي النتيجة نفسها في كل فحص',
      ],
    },
    figure: {
      label: 'مثال: تقرير فحص لإحدى صفحات اختبارنا',
      source: 'مثال من صفحة اختبار',
      outOf: 'من 100',
      tally: (failed, passed) =>
        `${failed === 0 ? 'لم تفشل أي قاعدة' : `فشلت ${arabicCount(failed, RULES_NOMINATIVE)}`} · نجحت ${arabicCount(passed, RULES_NOMINATIVE)}`,
      categories: 'درجة كل فئة',
      found: 'ما وجدناه',
      element: 'العنصر',
      inEngines: (names) => `في ${names}`,
      onlyIn: (name) => `في ${name} وحده`,
      declarations: (count) =>
        `${arabicCount(count, {
          one: 'في خاصية واحدة',
          two: 'في خاصيتين',
          few: 'في {n} خصائص',
          many: 'في {n} خاصية',
        })} من ملف CSS واحد`,
      offscreen: (pixels) => `${pixels} بكسل خارج الشاشة`,
      float: {
        parted: 'انفصلت حروف العنوان',
        screen: (pixels) => `شاشة ${pixels} بكسل`,
        overflow: (pixels) => `عنصر يتجاوزها بمقدار ${pixels} بكسل`,
        passed: (rules) => `نجحت ${arabicCount(rules, RULES_NOMINATIVE)}`,
        skipped: (rules) => `ولم تنطبق ${arabicCount(rules, RULES_NOMINATIVE)} على الصفحة`,
      },
    },
    marquee: { label: (tools) => `من أدواتنا (${arabicCount(tools, TOOLS)})` },
    counts: {
      label: 'Arablyzer بالأرقام',
      tools: noun({
        one: 'أداة مجانية',
        two: 'أداتان مجانيتان',
        few: 'أدوات مجانية',
        many: 'أداة مجانية',
      }),
      rules: noun({
        one: 'قاعدة نفحص بها',
        two: 'قاعدتان نفحص بهما',
        few: 'قواعد نفحص بها',
        many: 'قاعدة نفحص بها',
      }),
      browsers: noun({
        one: 'متصفح لكل صفحة',
        two: 'متصفحان لكل صفحة',
        few: 'متصفحات لكل صفحة',
        many: 'متصفحاً لكل صفحة',
      }),
      guides: noun({
        one: 'دليل لرسالة في Search Console',
        two: 'دليلان لرسائل Search Console',
        few: 'أدلة لرسائل Search Console',
        many: 'دليلاً لرسائل Search Console',
      }),
      terms: noun({
        one: 'مصطلح بالعربية',
        two: 'مصطلحان بالعربية',
        few: 'مصطلحات بالعربية',
        many: 'مصطلحاً بالعربية',
      }),
    },
    bento: {
      kicker: 'ما لا تراه الأدوات الأجنبية',
      title: 'كل ما يحتاجه موقع عربي، في فحص واحد',
      lead: 'من اتصال الحروف إلى روابط واتساب وزواحف الذكاء الاصطناعي، بالدليل من صفحتك نفسها.',
      example: 'مثال',
      engines: {
        title: 'ثلاثة متصفحات، ثلاث قراءات',
        text: 'كل محرّك يرسم العربية بطريقته. في صفحة اختبارنا رسم WebKit وحده تباعد الحروف، ففصل حروفاً يجب أن تتصل.',
        joined: 'متصلة',
        apart: 'تنفصل',
      },
      forms: {
        title: 'نماذج تقبل «محمد» والأرقام العربية',
        text: 'نكتب في الحقول داخل المتصفح قيماً مثل «محمد العبري» ونسأله هل يقبلها، ولا نرسل النموذج أبداً.',
        phone: 'رقم الجوال',
        nameAccepted: 'قبِل الاسم',
        digitsRejected: 'رفض الأرقام العربية',
      },
      whatsapp: { title: 'رابط واتساب يفتح فعلاً' },
      ai: {
        title: 'هل يصل إليك بحث الذكاء الاصطناعي؟',
        allowed: 'مسموح',
        blocked: 'ممنوع',
      },
      speed: {
        title: 'سرعة زوارك الحقيقيين على الجوال',
        text: 'من بيانات Google لزوار صفحتك الفعليين (CrUX)، لا من محاكاة.',
        seconds: 'ث',
        milliseconds: 'ملّي ث',
      },
      trust: { title: 'الثقة والأمان', ok: 'سليم', missing: 'مفقود' },
      robots: { title: 'robots.txt والأرشفة', blocks: 'يمنع Googlebot من صفحتك' },
    },
    how: {
      kicker: 'كيف يعمل',
      title: 'من الرابط إلى الدليل في ثلاث خطوات',
      steps: [
        {
          title: 'ألصق الرابط',
          text: 'صفحة واحدة، من موقعك أو من أي موقع عام. مجاناً، وبلا تسجيل.',
        },
        {
          title: 'نفتحها في ثلاثة متصفحات',
          text: 'Chromium وFirefox وWebKit، كل واحد في سياق جديد خلف بوابة الحماية، ونقيس ما يراه الزائر فعلاً.',
        },
        {
          title: 'تقرير بالأدلة',
          text: 'كل مشكلة بمكانها في الصفحة، والمتصفح الذي ظهرت فيه، وطريقة إصلاحها.',
        },
      ],
    },
    monitoring: {
      kicker: 'لوحة التحكم',
      soon: 'قريباً',
      title: 'راقب مواقعك كل يوم، ونخبرك حين تظهر مشكلة',
      text: 'سنفحص صفحاتك في المتصفحات الثلاثة كل يوم، ونحفظ سجل الدرجة، ونرسل لك ما تغيّر.',
      points: [
        'فحص يومي لمواقعك',
        'تنبيه حين تظهر مشكلة جديدة',
        'سجل الدرجة لكل موقع',
        'ما تغيّر بين فحصين',
      ],
      scan: 'افحص مجاناً الآن',
      plans: 'الخطط',
      preview: {
        label: 'معاينة للوحة التحكم ببيانات مثال',
        example: 'بيانات مثال',
        live: 'مراقبة يومية',
        score: 'الدرجة',
        problems: 'المشاكل',
        pages: 'الصفحات',
        alert: 'مشكلة جديدة خطيرة: صفحة أعرض من شاشة الهاتف',
      },
    },
    plans: {
      kicker: 'الخطط',
      title: 'الفحص مجاني، والمراقبة للمواقع الجادّة',
      lead: 'كل أدوات الصفحة الواحدة مجانية وتبقى كذلك. والخطط المدفوعة للاستخدام الكثيف وحده.',
      soon: 'قريباً',
      note: 'لم نحدد الخطط المدفوعة ولا أسعارها بعد. وأدوات الصفحة الواحدة تبقى مجانية وبلا تسجيل.',
      includesFree: 'كل ما في المجاني',
      free: {
        name: 'مجاني',
        tag: 'متاح الآن',
        text: 'كل أدوات الصفحة الواحدة، وتبقى كذلك.',
        allTools: (tools) => `كل الأدوات، وعددها ${tools}`,
        points: ['تقرير برابط خاص', 'بلا تسجيل'],
        cta: 'افحص الآن',
      },
      monitoring: {
        name: 'مراقبة يومية',
        text: 'للمواقع التي تتغير كل يوم.',
        points: ['مراقبة مواقع كثيرة كل يوم', 'تنبيه حين تظهر مشكلة جديدة'],
      },
      crawl: {
        name: 'زحف المواقع الكاملة',
        text: 'حين لا تكفي صفحة واحدة.',
        points: ['زحف مواقع كاملة، لا صفحة واحدة'],
      },
    },
    faq: {
      kicker: 'أسئلة شائعة',
      title: 'قبل أن تبدأ',
      items: [
        {
          question: 'هل Arablyzer مجاني؟',
          answer:
            'كل أدوات الصفحة الواحدة مجانية وبلا تسجيل، وتبقى كذلك. والخطط المدفوعة، حين تأتي، للاستخدام الكثيف وحده: مراقبة مواقع كثيرة كل يوم، وزحف مواقع كاملة.',
        },
        {
          question: 'ماذا تحفظون من صفحتي؟',
          answer:
            'التقرير وحده: نتائج القواعد، ومقتطفات قصيرة من صفحتك دليلاً عليها. يفتحه رابطه، ولا يظهر في محركات البحث. ولا نحفظ من زيارتك ترويسات ولا كوكيز ولا عنوان IP: حدود الفحص تعدّ رمزاً مشتقاً منه، يتغيّر كل يوم ويُحذف حين تنتهي مدة الحدّ. ونموذج الفحص يستعمل Cloudflare Turnstile ليميّز الناس من البرامج الآلية، فيُحمَّل من Cloudflare حين تبدأ به.',
        },
        {
          question: 'هل تملؤون النماذج أو ترسلونها؟',
          answer:
            'لا نرسل أي نموذج أبداً. نكتب في الحقول داخل المتصفح قيماً مثل «محمد العبري»، ونسأله هل يقبلها، ثم نغادر الصفحة دون إرسال شيء.',
        },
        {
          question: 'لماذا ثلاثة متصفحات؟',
          answer:
            'لأن كل محرّك يرسم العربية بطريقته: في صفحة اختبارنا رسم WebKit وحده تباعد الحروف، ففصل حروفاً يجب أن تتصل. Chromium محرّك Chrome وEdge، وFirefox له محرّكه، وWebKit محرّك Safari، لكننا نشغّله على Linux، فهو قريب من Safari وليس مثله تماماً.',
        },
      ],
    },
    cta: {
      title: 'افحص صفحتك الآن',
      text: 'مجاناً، وبلا تسجيل. ولا يرى التقرير إلا من معه رابطه.',
      button: 'ابدأ الفحص',
    },
  },
  en: {
    meta: {
      title: 'Arablyzer: check your site as Google and Arabic readers see it',
      description:
        'Free tools, no sign-up: your page opened in three browsers, with Arabic letter joining, page direction, fonts, forms, Gulf prices and Google indexing measured.',
    },
    hero: {
      pill: {
        count: (tools) => englishCount(tools, 'tool', 'tools'),
        text: 'all free, with no sign-up',
      },
      title: 'Check your site as Google sees it,',
      titleMark: 'and as Arabic readers see it on their phones',
      lead: 'We open your page in three browsers and check Arabic letters, direction, fonts and forms.',
      scope: { label: 'All checks', rules: (rules) => englishCount(rules, 'rule', 'rules') },
      engines: 'The page is opened in these browsers',
      tools: {
        label: 'Quick tools',
        names: {
          'rtl-check': 'Page direction (RTL)',
          'arabic-shaping-check': 'Letter joining',
          'arabic-font-check': 'Arabic font',
          'arabic-form-test': 'Forms that accept «محمد»',
          'whatsapp-link-generator': 'WhatsApp link generator',
        },
        all: 'All tools',
      },
      promises: [
        'Free, no sign-up',
        'We never submit a form',
        'The same page gives the same result, every scan',
      ],
    },
    figure: {
      label: 'Example: the report of one of our test pages',
      source: 'From one of our test pages',
      outOf: 'out of 100',
      tally: (failed, passed) =>
        `${failed === 0 ? 'No rule failed' : `${englishCount(failed, 'rule', 'rules')} failed`} · ${passed} passed`,
      categories: 'Score by category',
      found: 'What we found',
      element: 'Element',
      inEngines: (names) => `In ${names}`,
      onlyIn: (name) => `In ${name} only`,
      declarations: (count) =>
        `In ${englishCount(count, 'declaration', 'declarations')} of one CSS file`,
      offscreen: (pixels) => `${pixels} px off-screen`,
      float: {
        parted: 'The title’s letters came apart',
        screen: (pixels) => `${pixels}-pixel screen`,
        overflow: (pixels) => `An element runs ${pixels} px past it`,
        passed: (rules) => `${englishCount(rules, 'rule', 'rules')} passed`,
        skipped: (rules) => `${englishCount(rules, 'rule', 'rules')} did not apply to the page`,
      },
    },
    marquee: { label: (tools) => `From our ${tools} tools` },
    counts: {
      label: 'Arablyzer in numbers',
      tools: (count) => englishForm(count, 'free tool', 'free tools'),
      rules: (count) => englishForm(count, 'rule we check with', 'rules we check with'),
      browsers: (count) => englishForm(count, 'browser for every page', 'browsers for every page'),
      guides: (count) =>
        englishForm(
          count,
          'fix guide for Search Console messages',
          'fix guides for Search Console messages',
        ),
      terms: (count) => englishForm(count, 'glossary term in Arabic', 'glossary terms in Arabic'),
    },
    bento: {
      kicker: 'What other tools don’t see',
      title: 'Everything an Arabic site needs, in one scan',
      lead: 'From letter joining to WhatsApp links and AI crawlers, with evidence from your own page.',
      example: 'Example',
      engines: {
        title: 'Three browsers, three readings',
        text: 'Each engine draws Arabic its own way. On our test page, only WebKit drew letter-spacing, pulling apart letters that should join.',
        joined: 'Joined',
        apart: 'Apart',
      },
      forms: {
        title: 'Forms that accept «محمد» and Arabic digits',
        text: 'In the browser, we type values such as «محمد العبري» into the fields and ask whether it accepts them. We never submit the form.',
        phone: 'Phone number',
        nameAccepted: 'Name accepted',
        digitsRejected: 'Digits rejected',
      },
      whatsapp: { title: 'A WhatsApp link that really opens' },
      ai: {
        title: 'Can AI search reach you?',
        allowed: 'Allowed',
        blocked: 'Blocked',
      },
      speed: {
        title: 'The speed your real visitors get on phones',
        text: 'From Google’s data on your page’s actual visitors (CrUX), not from a simulation.',
        seconds: 's',
        milliseconds: 'ms',
      },
      trust: { title: 'Trust and security', ok: 'OK', missing: 'Missing' },
      robots: { title: 'robots.txt and indexing', blocks: 'Blocks Googlebot from your page' },
    },
    how: {
      kicker: 'How it works',
      title: 'From a link to evidence in three steps',
      steps: [
        {
          title: 'Paste the link',
          text: 'One page, from your site or any public site. Free, no sign-up.',
        },
        {
          title: 'We open it in three browsers',
          text: 'Chromium, Firefox and WebKit, each in a fresh context behind our protection gateway, measuring what a visitor actually sees.',
        },
        {
          title: 'A report with evidence',
          text: 'Every problem with its place on the page, the browser it showed in, and how to fix it.',
        },
      ],
    },
    monitoring: {
      kicker: 'Dashboard',
      soon: 'Coming soon',
      title: 'Monitor your sites every day, and hear from us when a problem shows up',
      text: 'We will check your pages in all three browsers every day, keep the score’s history, and send you what changed.',
      points: [
        'A daily scan of your sites',
        'An alert when a new problem appears',
        'The score’s history for each site',
        'What changed between two scans',
      ],
      scan: 'Scan free now',
      plans: 'See the plans',
      preview: {
        label: 'A preview of the dashboard, with example data',
        example: 'Example data',
        live: 'Daily monitoring',
        score: 'Score',
        problems: 'Problems',
        pages: 'Pages',
        alert: 'New serious problem: a page wider than a phone screen',
      },
    },
    plans: {
      kicker: 'Plans',
      title: 'Scanning is free; monitoring is for serious sites',
      lead: 'Every single-page tool is free and stays free. Paid plans are for heavy use only.',
      soon: 'Coming soon',
      note: 'The paid plans and their prices are not decided yet. Every single-page tool stays free, with no sign-up.',
      includesFree: 'Everything in Free',
      free: {
        name: 'Free',
        tag: 'Available now',
        text: 'Every single-page tool, and it stays that way.',
        allTools: (tools) => `All ${tools} tools`,
        points: ['A report with a private link', 'No sign-up'],
        cta: 'Scan now',
      },
      monitoring: {
        name: 'Daily monitoring',
        text: 'For sites that change every day.',
        points: ['Monitoring of many sites every day', 'An alert when a new problem appears'],
      },
      crawl: {
        name: 'Full-site crawls',
        text: 'When one page is not enough.',
        points: ['Crawl whole sites, not one page'],
      },
    },
    faq: {
      kicker: 'FAQ',
      title: 'Before you start',
      items: [
        {
          question: 'Is Arablyzer free?',
          answer:
            'Every single-page tool is free with no sign-up, and stays that way. Paid plans, when they come, are only for heavy use: monitoring many sites every day and crawling whole sites.',
        },
        {
          question: 'What do you keep from my page?',
          answer:
            'Only the report: the rules’ results, with short excerpts of your page as evidence. Its link opens it, and it never appears in search engines. From your visit we keep no headers, no cookies and no IP address: the scan limits count a code made from it, which changes every day and is deleted when the limit’s window ends. The scan form uses Cloudflare Turnstile to tell people from bots, so it loads from Cloudflare when you start on the form.',
        },
        {
          question: 'Do you fill in or submit forms?',
          answer:
            'We never submit a form. In the browser, we type values such as «محمد العبري» into the fields, ask the browser whether it accepts them, and leave without sending anything.',
        },
        {
          question: 'Why three browsers?',
          answer:
            'Because each engine draws Arabic its own way: on our test page, only WebKit drew the letter-spacing, pulling apart letters that should join. Chromium is the engine of Chrome and Edge, Firefox has its own, and WebKit is Safari’s; we run it on Linux, so it is close to Safari but not the same.',
        },
      ],
    },
    cta: {
      title: 'Check your page now',
      text: 'Free, no sign-up. Only people with its link can see the report.',
      button: 'Start the scan',
    },
  },
}
